-- Local development only. The application role owns only its own database.
CREATE USER healthcare_app WITH PASSWORD 'local_app_password';
CREATE DATABASE healthcare OWNER healthcare_app;
-- Pre-create Temporal stores so startup is reliable with the pinned auto-setup image.
-- The Temporal container owns and migrates these schemas; the app user cannot access them.
CREATE DATABASE temporal OWNER temporal;
CREATE DATABASE temporal_visibility OWNER temporal;

