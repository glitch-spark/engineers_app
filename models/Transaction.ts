import { Schema, model, models, Types } from 'mongoose';
const TransactionSchema = new Schema({
    userId: { type: Types.ObjectId, ref: 'UserExtra', required: true },
  date: { type: Date, required: true },
  amount: { type: Number, required: true },
  description: String,
  notes: String,
  status: { type: String, enum: ['pending','approved','rejected'], default: 'pending' },
  approvedBy: { type: Types.ObjectId, ref: 'UserExtra' },
  approvedAt: Date,
}, { timestamps: true });
export default models.Transaction || model('Transaction', TransactionSchema);
