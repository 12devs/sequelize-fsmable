import { Table, Column, DataType, CreatedAt, UpdatedAt, Scopes, BelongsTo } from 'sequelize-typescript';
import {
	literal,
	BelongsToGetAssociationMixin,
	BelongsToGetAssociationMixinOptions,
	Transaction,
	ModelAttributes,
	InitOptions,
} from 'sequelize';
import { Eventable } from '@bct/eventable';
// import { enqueue_deposit_collection } from '../tasks/queue';
import { TIDIdentifiable, FeeChargeable, FSMable, BelongsToCurrency } from './concerns';
import { Currencies } from './Currencies';
import { Members } from './Members';
import { BaseModel } from './shared/BaseModel';
import { Accounts } from './Accounts';

@Scopes(() => ({
	recent: {
		order: [['id', 'DESC']],
	},
	withCurrency: {
		include: [
			{
				model: Currencies,
				as: 'currency',
				required: true,
			},
		],
	},
	withMember: {
		include: [
			{
				model: Members,
				as: 'member',
				required: true,
			},
		],
	},
}))
@Table({
	indexes: [
		{
			name: 'index_deposits_on_aasm_state_and_member_id_and_currency_id',
			fields: ['aasm_state', 'member_id', 'currency_id'],
		},
		{
			name: 'index_deposits_on_currency_id',
			unique: true,
			fields: ['currency_id'],
		},
		{
			name: 'index_deposits_on_currency_id_and_txid_and_txout',
			unique: true,
			fields: ['currency_id', 'txid', 'txout'],
		},
		{
			name: 'index_deposits_on_member_id_and_txid',
			fields: ['member_id', 'txid'],
		},
		{
			name: 'index_deposits_on_tid',
			fields: ['tid'],
		},
		{
			name: 'index_deposits_on_type',
			fields: ['type'],
		},
	],
	timestamps: true,
	underscored: true,
	tableName: 'deposits',
})
export class Deposits extends BaseModel {
	@Column({
		type: DataType.INTEGER,
		allowNull: false,
	})
	member_id!: number;

	@Column({
		type: DataType.STRING(20),
		allowNull: false,
	})
	currency_id!: string;

	@Column({
		type: DataType.DECIMAL(32, 16),
		allowNull: false,
		defaultValue: 0,
	})
	amount!: string;

	@Column({
		type: DataType.DECIMAL(32, 16),
		allowNull: false,
		defaultValue: 0,
	})
	fee!: string;

	@Column({
		type: DataType.STRING(128),
		allowNull: true,
	})
	address!: string | null;

	@Column({
		type: DataType.STRING(128),
		allowNull: true,
	})
	txid!: string | null;

	@Column({
		type: DataType.INTEGER,
		allowNull: true,
	})
	txout!: number | null;

	@Column({
		type: DataType.STRING(30),
		allowNull: false,
	})
	aasm_state!: string;

	@Column({
		type: DataType.INTEGER,
		allowNull: true,
	})
	block_number!: number | null;

	@Column({
		type: DataType.STRING(30),
		allowNull: false,
	})
	type!: string;

	// 'The transaction ID.'
	// 'The shared transaction ID. Must not exceed 64 characters.
	// Peatio will generate one automatically unless supplied.'
	@Column({
		type: DataType.STRING(64),
		allowNull: false,
	})
	tid!: string;

	@Column({
		type: DataType.DATE,
		allowNull: true,
	})
	completed_at!: Date | null;

	@CreatedAt
	@Column({
		type: DataType.DATE,
		allowNull: false,
		defaultValue: literal('CURRENT_TIMESTAMP'),
	})
	readonly created_at!: Date;

	@UpdatedAt
	@Column({
		type: DataType.DATE,
		allowNull: false,
		defaultValue: literal('CURRENT_TIMESTAMP'),
	})
	readonly updated_at!: Date;

	static init(attributes: ModelAttributes, options: InitOptions) {
		super.init(attributes, options);

		TIDIdentifiable.init(this);
		FeeChargeable.init(this);
		BelongsToCurrency.init(this);
		Eventable.init(this);

		FSMable.init(this, {
			field: 'aasm_state',
			whiny_transitions: false,
			states: [
				{ state: 'submitted', initial: true },
				{ state: 'new' },
				{ state: 'canceled' },
				{ state: 'rejected' },
				{ state: 'accepted' },
			],
			events: [
				{ event: 'submit', transitions: { from: 'new', to: 'canceled' } },
				{ event: 'cancel', transitions: { from: 'submitted', to: 'canceled' } },
				{ event: 'reject', transitions: { from: 'submitted', to: 'rejected' } },
				{
					event: 'accept',
					transitions: { from: 'submitted', to: 'accepted' },
					after: ['plus_funds', 'collect'],
				},
			],
		});
	}

	@BelongsTo(() => Currencies, 'currency_id')
	readonly currency!: Currencies;

	@BelongsTo(() => Members, 'member_id')
	readonly member!: Members;

	getCurrency!: BelongsToGetAssociationMixin<Currencies>;
	getMember!: BelongsToGetAssociationMixin<Members>;

	async collect(opts: BelongsToGetAssociationMixinOptions) {
		const currency = this.currency ? this.currency : await this.getCurrency(opts);
		if (currency.is_coin()) {
			// await enqueue_deposit_collection(currency, this.id);
		}
	}

	async plus_funds(opts: { transaction: Transaction }) {
		const account = await this.account({ transaction: opts.transaction });
		return await account.plus_funds(parseFloat(this.amount), opts.transaction);
	}

	async account(opts: any = {}): Promise<Accounts> {
		const member = await this.getMember(opts);
		return await member.get_account(this.currency_id, opts);
	}
}
