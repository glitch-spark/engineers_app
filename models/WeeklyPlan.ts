import { Schema, model, models, Types } from 'mongoose';

const WeeklyPlanSchema = new Schema({
  userId: { type: Types.ObjectId, ref: 'UserExtra', required: true },
  weekNumber: { type: Number, required: true },
  year: { type: Number, required: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  content: { type: String, required: true },
  result: { type: String, default: '' },
}, { timestamps: true });

// Index for efficient querying
WeeklyPlanSchema.index({ userId: 1, year: 1, weekNumber: 1 });
WeeklyPlanSchema.index({ year: 1, weekNumber: 1 });

export default models.WeeklyPlan || model('WeeklyPlan', WeeklyPlanSchema);
