-- levels: loudness at the watch's mic before any gain, one character per second of the clip (ClipWriter.levelChar).
-- speaker_db: from that and the transcript's timings, how loud each speaker was (JSON, "Speaker 0" → dB).
-- The watch is on the wearer's wrist, so a clearly loudest voice is usually theirs.
ALTER TABLE recordings ADD COLUMN levels TEXT;
ALTER TABLE recordings ADD COLUMN speaker_db TEXT;
