import { Schema, model, models, Types } from 'mongoose';
const AccountSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  address: String,
  createdBy: { type: Types.ObjectId, ref: 'UserExtra', required: true },
}, { timestamps: true });
export default models.Account || model('Account', AccountSchema);
