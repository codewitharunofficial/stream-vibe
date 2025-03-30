import mongoose from "mongoose";

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  profilePic: { type: String },
  favourites: { type: Array, default: [] },
  recently_played: { type: Array, default: [] },
  recommendations: { type: Array, default: [] },
  most_played: { type: Array, default: [] },
  playlists: { type: Array, default: [] },
});

export default mongoose.models.User || mongoose.model("User", UserSchema);
