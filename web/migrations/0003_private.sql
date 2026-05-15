ALTER TABLE clients ADD COLUMN private INTEGER NOT NULL DEFAULT 0;
UPDATE clients SET private = 1 WHERE name = 'ryotaro';
