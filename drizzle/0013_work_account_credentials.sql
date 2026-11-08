CREATE TABLE IF NOT EXISTS work_account_credentials (account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE, ciphertext TEXT NOT NULL);
