import { Model } from 'sequelize-typescript';

export class BaseModel extends Model {
	async within_transaction(fn: Function, args?: any) {
		args = args || [];

		try {
			const transaction = await this.sequelize.transaction();
			try {
				await fn.apply(this, args.concat([transaction]));
				await transaction.commit();
			} catch (err) {
				await transaction.rollback();
				throw err;
			}
		} catch (e) {}
		return this;
	}
}
