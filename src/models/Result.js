const mongoose = require("mongoose");
const { Schema, Types } = mongoose;

const ResultSchema = new Schema(
  {
    game: { type: Types.ObjectId, ref: "Game", required: true, index: true },
    dateStr: { type: String, required: true },
    slotMin: { type: Number, required: true, min: 0, max: 1439 },
    value: { type: String, required: true, trim: true },
    source: { type: String, default: "manual" },
    note: { type: String, default: "" }
  },
  { timestamps: true }
);

ResultSchema.index({ game: 1, dateStr: 1, slotMin: 1 }, { unique: true });
ResultSchema.index({ dateStr: 1, slotMin: 1 });

module.exports = mongoose.model("Result", ResultSchema);
