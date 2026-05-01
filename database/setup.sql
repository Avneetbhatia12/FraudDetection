-- Run this file to set up the entire database in one shot
-- mysql -u root -p < database/setup.sql

SOURCE database/schema.sql;
SOURCE database/seed.sql;
SOURCE database/procedures_triggers.sql;
