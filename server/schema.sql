CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'user') DEFAULT 'user',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert dummy admin user for testing (Password is: 123456)
-- Consider removing or changing this in production
INSERT IGNORE INTO users (email, name, password, role) VALUES ('admin@example.com', 'Administrator', '$2a$10$eO0gO7hY7kP5lq8RzR3K6uL3k/1q5aV4vA8d0x6X4R5zK8X8jM1R6', 'admin');
