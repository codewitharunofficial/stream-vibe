import mongoose from "mongoose";

const SongSchema = new mongoose.Schema({
    id: {type: String, required: true, unique: true},
    song: {type: Object, required: true}
});

export default mongoose.models.Song || mongoose.model("Song", SongSchema);