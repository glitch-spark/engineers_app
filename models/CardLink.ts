import { Schema, model, models, Types } from 'mongoose';
const CardLinkSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'UserExtra', required: true },
  email: { type: String, required: true },
  cardNumber: {type: String, required: true },
  site: {type: String, required: true },
  from: { type: Date, required: true },
  to: {type: Date, required: true},
  status: { type: String, enum: ['billing','canceled'], default: 'billing' },
  approvedBy: { type: Types.ObjectId, ref: 'UserExtra' },
  approvedAt: Date,
}, { timestamps: true });
export default models.CardLink || model('CardLink', CardLinkSchema);
