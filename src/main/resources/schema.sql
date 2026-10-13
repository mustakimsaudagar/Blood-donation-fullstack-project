CREATE TABLE IF NOT EXISTS donors (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(120) NOT NULL,
    blood_group VARCHAR(3) NOT NULL,
    city VARCHAR(100) NOT NULL,
    phone VARCHAR(30) NOT NULL,
    last_donation DATE NULL,
    donations INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE KEY uq_donors_name_phone (name, phone),
    INDEX idx_donors_match (blood_group, city, is_active, last_donation)
);

CREATE TABLE IF NOT EXISTS inventory (
    blood_group VARCHAR(3) PRIMARY KEY,
    units INT NOT NULL DEFAULT 0,
    threshold_units INT NOT NULL DEFAULT 8,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blood_requests (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    patient_name VARCHAR(120) NOT NULL,
    hospital VARCHAR(160) NOT NULL,
    city VARCHAR(100) NOT NULL,
    blood_group VARCHAR(3) NOT NULL,
    units INT NOT NULL,
    urgency VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_requests_status_created (status, created_at),
    INDEX idx_requests_group_city (blood_group, city)
);

CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    blood_group VARCHAR(3) NOT NULL,
    units_delta INT NOT NULL,
    reason VARCHAR(240) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_inventory_adjustments_created (created_at)
);

CREATE TABLE IF NOT EXISTS donation_appointments (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    donor_id BIGINT NOT NULL,
    request_id BIGINT NULL,
    scheduled_at DATETIME NOT NULL,
    location VARCHAR(160) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'SCHEDULED',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_appointments_donor FOREIGN KEY (donor_id) REFERENCES donors(id),
    CONSTRAINT fk_appointments_request FOREIGN KEY (request_id) REFERENCES blood_requests(id),
    INDEX idx_appointments_schedule (scheduled_at, status),
    INDEX idx_appointments_donor (donor_id, status)
);

INSERT IGNORE INTO inventory (blood_group, units, threshold_units) VALUES
('O-', 3, 8), ('O+', 18, 12), ('A-', 6, 8), ('A+', 22, 12),
('B-', 4, 8), ('B+', 14, 10), ('AB-', 7, 6), ('AB+', 10, 8);

INSERT INTO donors (name, blood_group, city, phone, last_donation, donations) VALUES
('Aarav Mehta', 'O-', 'Pune', '*** *** 2841', DATE_SUB(CURDATE(), INTERVAL 102 DAY), 5),
('Anaya Shah', 'O+', 'Pune', '*** *** 6517', DATE_SUB(CURDATE(), INTERVAL 71 DAY), 2),
('Rohan Kulkarni', 'A-', 'Pune', '*** *** 9304', DATE_SUB(CURDATE(), INTERVAL 39 DAY), 4),
('Sara Thomas', 'A+', 'Pune', '*** *** 1182', DATE_SUB(CURDATE(), INTERVAL 120 DAY), 8),
('Kabir Nair', 'B+', 'Mumbai', '*** *** 4405', DATE_SUB(CURDATE(), INTERVAL 61 DAY), 1),
('Isha Patel', 'O-', 'Mumbai', '*** *** 7729', NULL, 0),
('Dev Malhotra', 'AB+', 'Pune', '*** *** 3056', DATE_SUB(CURDATE(), INTERVAL 200 DAY), 11),
('Mira Rao', 'B-', 'Pune', '*** *** 8146', DATE_SUB(CURDATE(), INTERVAL 58 DAY), 3)
ON DUPLICATE KEY UPDATE name = VALUES(name);

INSERT INTO blood_requests (patient_name, hospital, city, blood_group, units, urgency, status)
SELECT 'Patient A', 'Sahyadri Hospital', 'Pune', 'O-', 2, 'URGENT', 'OPEN'
WHERE NOT EXISTS (SELECT 1 FROM blood_requests);