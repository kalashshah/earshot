-- Non-speech sounds the iPhone's classifier heard through the clip ("crowd, dishes"): tells the model where it happened.
ALTER TABLE recordings ADD COLUMN ambient TEXT;
