import { Model } from 'sequelize-typescript';

export class FSMableInvalidTransition extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'FSMableException';
	}
}

export const FSMable = {
	init: (
		model: typeof Model,
		options: {
			field: string;
			whiny_transitions: boolean;
			states: { state: string; initial?: boolean }[];
			events: {
				event: string;
				transitions: { from: string | string[]; to: string };
				before?: (string | Function)[];
				after?: (string | Function)[];
			}[];
		}
	) => {
		const modelName = model.name;
		const { field, whiny_transitions } = options;

		const states = options.states.slice();
		const events = (options.events || []).slice().map(event => {
			const { from } = event.transitions;
			event.transitions.from = Array.isArray(from) ? from : [from];
			return event;
		});

		const callHooks = async (instance: Model, hooks: (string | Function)[] | undefined, args: any) => {
			if (hooks) {
				for (const method of hooks) {
					if (typeof method === 'string') {
						await instance[method](args);
					} else if (typeof method === 'function') {
						await method.apply(instance, args);
					}
				}
			}
		};

		const generateMayTransitMethod = (event: string, transactions: { from: string | string[] }) => {
			model.prototype[`may_${event}`] = function () {
				return transactions.from.includes(this[field]);
			};
		};

		const generateIsAtStateMethod = (state: string) => {
			model.prototype[`is_${state}`] = function () {
				return this[field] === state;
			};
		};

		const generateStateConst = (state: string) => {
			model[`state_${state}`.toUpperCase()] = state;
		};

		const generateTransitionMethod = (
			event: string,
			transactions: { from: string | string[]; to: string },
			before?: (string | Function)[],
			after?: (string | Function)[]
		) => {
			model.prototype[event] = async function (opts: any) {
				const currVal = this[field] as string;
				if (!transactions.from.includes(currVal)) {
					if (!whiny_transitions) {
						return false;
					}
					throw new FSMableInvalidTransition(
						`${modelName} cannot transit from ${currVal} to ${transactions.to}`
					);
				}
				const args = Object.assign({}, opts, { from: currVal, to: transactions.to });
				if (opts.before) {
					const fn = opts.before;
					fn.bind(this);
					await fn();
				}
				await callHooks(this, before, args);
				this[field] = transactions.to;
				await this.save(opts);
				if (opts.after) {
					const fn = opts.after;
					fn.bind(this);
					await fn();
				}
				await callHooks(this, after, args);
				return this;
			};
		};
		const generateScope = (state: string) => {
			model.addScope(state, {
				where: {
					[field]: state,
				},
			});
		};

		events.forEach(e => {
			generateMayTransitMethod(e.event, e.transitions);
			generateTransitionMethod(e.event, e.transitions, e.before, e.after);
		});

		states.forEach(({ state }) => {
			generateIsAtStateMethod(state);
			generateScope(state);
			generateStateConst(state);
		});

		model.addHook('beforeValidate', `fsmableValidate${modelName}`, instance => {
			// set default state
			if (!instance[field]) {
				const state = states.find(s => s.initial) || states[0];
				instance[field] = state.state;
			}
		});

		// Unstable constant, can be overwritten.
		(model as any).STATES = states.map(s => s.state);

		model[`fsmable_${field}`] = {
			states,
			events,
		};

		const permitted_events = function (this: any) {
			const currState = this[field];
			return events.filter(event => event.transitions.from.includes(currState));
		};

		const disabled_events = function (this: any) {
			const currState = this[field];
			return events.filter(({ transitions }) => !transitions.from.includes(currState));
		};

		model.prototype[`fsmable_${field}`] = {
			permitted_states: function () {
				const to = permitted_events.call(this).map(({ transitions }) => transitions.to);
				return states.filter(({ state }) => to.includes(state));
			},
			disabled_states: function () {
				const to = disabled_events.call(this).map(({ transitions }) => transitions.to);
				return states.filter(({ state }) => to.includes(state));
			},
			permitted_events,
			disabled_events,
		};
	},
};

// TODO - autogenerate state constants
//
// example:
//
// const Deposits = {};
//
// FSMable.include(Deposits, {
//   field: 'state',
//   whiny_transitions: false, // don't throw exceptions on invalid transitions
//   states: [
//     {state: 'submitted', initial: true},
//     {state: 'canceled'},
//     {state: 'rejected'},
//     {state: 'accepted'},
//   ],
//   events: [
//     {event: 'cancel', transitions: {from: 'submitted', to: 'canceled'}},
//     {event: 'reject', transitions: {from: 'submitted', to: 'rejected'}},
//     {
//       event: 'accept',
//       transitions: {from: 'submitted', to: 'accepted'},
//       after: ['plus_funds', 'collect'],
//     },
//   ],
// });
//
// Deposits.prorotype.plus_funds = async function () {
//   //
// };
//
// Deposits.prorotype.collect = async function () {
//   //
// };
//
// Generated methods:
//
// deposit.reject({
//   before: () => {},
//   after: () => {},
//   transaction,
// });
// deposit.accept();
//
