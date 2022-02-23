import { Table, Column, DataType, CreatedAt, UpdatedAt, BelongsTo, Scopes } from 'sequelize-typescript';
import { literal, ModelAttributes, InitOptions } from 'sequelize';
import { Eventable } from '@bct/eventable';
import { FSMable } from './concerns';
import { Currencies } from './Currencies';
import { Members } from './Members';
import { Accounts } from './Accounts';
import { COMPLETED_STATES } from '../constants';
import { BaseModel } from './shared/BaseModel';

@Scopes(() => ({
	completed: {
		where: {
			aasm_state: COMPLETED_STATES,
		},
	},
}))
@Table({
	indexes: [
		{
			name: 'index_withdraws_on_aasm_state',
			fields: ['aasm_state'],
		},
		{
			name: 'index_withdraws_on_account_id',
			fields: ['account_id'],
		},
		{
			name: 'index_withdraws_on_currency_id',
			fields: ['currency_id'],
		},
		{
			name: 'index_withdraws_on_currency_id_and_txid',
			unique: true,
			fields: ['currency_id', 'txid'],
		},
		{
			name: 'index_withdraws_on_member_id',
			fields: ['member_id'],
		},
		{
			name: 'index_withdraws_on_tid',
			fields: ['tid'],
		},
		{
			name: 'index_withdraws_on_type',
			fields: ['type'],
		},
	],
	timestamps: true,
	underscored: true,
	tableName: 'withdraws',
})
export class Withdraws extends BaseModel {
	@Column({
		type: DataType.INTEGER,
		allowNull: false,
	})
	account_id!: number;

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
	})
	amount!: string;

	@Column({
		type: DataType.DECIMAL(32, 16),
		allowNull: false,
	})
	fee!: string;

	@Column({
		type: DataType.STRING(128),
		allowNull: true,
	})
	txid!: string | null;

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
		type: DataType.DECIMAL(32, 16),
		allowNull: false,
	})
	sum!: string;

	@Column({
		type: DataType.STRING(30),
		allowNull: false,
	})
	type!: string;

	@Column({
		// type: String, desc: 'The shared transaction ID.'
		// The shared transaction ID. Must not exceed 64 characters.
		// Peatio will generate one automatically unless supplied.
		type: DataType.STRING(64),
		allowNull: false,
	})
	tid!: string;

	@Column({
		type: DataType.STRING(128),
		allowNull: false,
	})
	rid!: string;

	@Column({
		type: DataType.STRING(1024),
		allowNull: false,
		defaultValue: '',
	})
	to_address!: string;

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

	// Associations
	@BelongsTo(() => Currencies, 'currency_id')
	readonly currency!: Currencies;

	@BelongsTo(() => Members, 'member_id')
	readonly member!: Members;

	@BelongsTo(() => Accounts, 'account_id')
	readonly account!: Accounts;

	static init(attributes: ModelAttributes, options: InitOptions) {
		super.init(attributes, options);

		Eventable.init(this);
		FSMable.init(this, {
			field: 'aasm_state',
			whiny_transitions: false,
			states: [
				{ state: 'new', initial: true },
				{ state: 'prepared' },
				{ state: 'submitted' },
				{ state: 'rejected' },
				{ state: 'accepted' },
				{ state: 'suspected' },
				{ state: 'processing' },
				{ state: 'succeed' },
				{ state: 'canceled' },
				{ state: 'failed' },
				{ state: 'confirming' },
			],
			events: [
				{
					event: 'submit',
					transitions: { from: 'prepared', to: 'submitted' },
					after: ['lock_funds'],
				},
				{
					event: 'cancel',
					transitions: { from: ['prepared', 'submitted', 'accepted'], to: 'canceled' },
					after: [
						function (this: any, transitions: { from: string }) {
							return transitions.from !== 'prepared' ? this.unlock_funds() : Promise.resolve(null);
						},
					],
				},
				{
					event: 'suspect',
					transitions: { from: 'submitted', to: 'suspected' },
					after: ['unlock_funds'],
				},
				{
					event: 'accept',
					transitions: { from: 'submitted', to: 'accepted' },
				},
				{
					event: 'reject',
					transitions: { from: ['submitted', 'accepted'], to: 'rejected' },
					after: ['unlock_funds'],
				},
				{
					event: 'process',
					transitions: { from: 'accepted', to: 'processing' },
					after: ['send_coins'],
				},
				// TODO: add validations that txid and block_number are not blank.
				{
					event: 'dispatch',
					transitions: { from: 'processing', to: 'confirming' },
				},
				{
					event: 'success',
					transitions: { from: 'confirming', to: 'succeed' },
					before: ['unlock_and_sub_funds'],
				},
				{
					event: 'fail',
					transitions: { from: ['processing', 'confirming'], to: 'failed' },
					after: ['unlock_funds'],
				},
			],
		});
	}

	is_completed(): boolean {
		return COMPLETED_STATES.includes(this.aasm_state);
	}
}
