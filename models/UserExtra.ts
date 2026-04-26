import { Schema, model, models } from 'mongoose';
const UserExtraSchema = new Schema({
  name: String,
  email: { type: String, unique: true, index: true },
  hashedPassword: String,
  role: { type: String, enum: ['admin','staff','accountant'], default: 'staff' },
  phone: String,
  birthday: Date,
  image: String,
}, { timestamps: true });
export default models.UserExtra || model('UserExtra', UserExtraSchema);
