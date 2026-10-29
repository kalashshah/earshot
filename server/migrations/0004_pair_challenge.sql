-- In-app sign-in: the iPhone sends sha256(verifier) when the code is minted and the verifier
-- when it claims, so a code that leaks through the earshot:// redirect is useless on its own.
ALTER TABLE pair_codes ADD COLUMN challenge TEXT;
