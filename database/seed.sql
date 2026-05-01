-- ============================================================
-- DML: Seed Data (30+ rows per table)
-- ============================================================
USE fraud_detection;

-- ============================================================
-- PATIENTS (30 rows)
-- ============================================================
INSERT INTO PATIENT (FIRST_NAME, LAST_NAME, GENDER, DOB, ADDRESS, EMAIL) VALUES
('Alice',   'Johnson',  'Female', '1985-03-12', '123 Maple St, New York, NY',       'alice.johnson@email.com'),
('Bob',     'Smith',    'Male',   '1978-07-22', '456 Oak Ave, Los Angeles, CA',      'bob.smith@email.com'),
('Carol',   'Williams', 'Female', '1990-11-05', '789 Pine Rd, Chicago, IL',          'carol.williams@email.com'),
('David',   'Brown',    'Male',   '1965-01-30', '321 Elm St, Houston, TX',           'david.brown@email.com'),
('Eva',     'Davis',    'Female', '1992-06-18', '654 Cedar Blvd, Phoenix, AZ',       'eva.davis@email.com'),
('Frank',   'Miller',   'Male',   '1955-09-25', '987 Birch Ln, Philadelphia, PA',    'frank.miller@email.com'),
('Grace',   'Wilson',   'Female', '1988-04-14', '147 Walnut Dr, San Antonio, TX',    'grace.wilson@email.com'),
('Henry',   'Moore',    'Male',   '1972-12-03', '258 Spruce Ct, San Diego, CA',      'henry.moore@email.com'),
('Iris',    'Taylor',   'Female', '1995-08-27', '369 Ash Way, Dallas, TX',           'iris.taylor@email.com'),
('Jack',    'Anderson', 'Male',   '1960-02-15', '741 Poplar Ave, San Jose, CA',      'jack.anderson@email.com'),
('Karen',   'Thomas',   'Female', '1983-05-09', '852 Willow St, Austin, TX',         'karen.thomas@email.com'),
('Leo',     'Jackson',  'Male',   '1975-10-21', '963 Magnolia Rd, Jacksonville, FL', 'leo.jackson@email.com'),
('Mia',     'White',    'Female', '1998-01-17', '159 Cypress Ave, Fort Worth, TX',   'mia.white@email.com'),
('Nathan',  'Harris',   'Male',   '1968-07-08', '357 Redwood Blvd, Columbus, OH',    'nathan.harris@email.com'),
('Olivia',  'Martin',   'Female', '1991-03-29', '486 Sequoia Dr, Charlotte, NC',     'olivia.martin@email.com'),
('Paul',    'Garcia',   'Male',   '1980-11-14', '624 Hickory Ln, Indianapolis, IN',  'paul.garcia@email.com'),
('Quinn',   'Martinez', 'Female', '1987-06-02', '753 Chestnut St, San Francisco, CA','quinn.martinez@email.com'),
('Ryan',    'Robinson', 'Male',   '1963-09-19', '861 Sycamore Ave, Seattle, WA',     'ryan.robinson@email.com'),
('Sara',    'Clark',    'Female', '1994-04-07', '972 Dogwood Rd, Denver, CO',        'sara.clark@email.com'),
('Tom',     'Rodriguez','Male',   '1970-12-26', '135 Hawthorn Blvd, Nashville, TN',  'tom.rodriguez@email.com'),
('Uma',     'Lewis',    'Female', '1986-08-13', '246 Juniper Ct, Oklahoma City, OK', 'uma.lewis@email.com'),
('Victor',  'Lee',      'Male',   '1977-02-04', '357 Larch Way, El Paso, TX',        'victor.lee@email.com'),
('Wendy',   'Walker',   'Female', '1993-05-31', '468 Fir St, Louisville, KY',        'wendy.walker@email.com'),
('Xavier',  'Hall',     'Male',   '1958-10-16', '579 Alder Ave, Portland, OR',       'xavier.hall@email.com'),
('Yara',    'Allen',    'Female', '1989-01-23', '681 Beech Rd, Las Vegas, NV',       'yara.allen@email.com'),
('Zach',    'Young',    'Male',   '1982-07-11', '792 Elm Blvd, Memphis, TN',         'zach.young@email.com'),
('Amy',     'Hernandez','Female', '1996-03-05', '813 Oak Dr, Baltimore, MD',         'amy.hernandez@email.com'),
('Brian',   'King',     'Male',   '1971-09-28', '924 Pine Ct, Milwaukee, WI',        'brian.king@email.com'),
('Chloe',   'Wright',   'Female', '1984-06-17', '135 Maple Way, Albuquerque, NM',    'chloe.wright@email.com'),
('Derek',   'Lopez',    'Male',   '1967-12-09', '246 Cedar St, Tucson, AZ',          'derek.lopez@email.com');

-- ============================================================
-- MEDICAL_PROVIDER (30 rows)
-- ============================================================
INSERT INTO MEDICAL_PROVIDER (PROVIDER_NAME, PROVIDER_TYPE, ADDRESS, CONTACT_NUMBER) VALUES
('City General Hospital',       'Hospital',       '100 Health Ave, New York, NY',        '212-555-0101'),
('Sunrise Medical Center',      'Hospital',       '200 Wellness Blvd, Los Angeles, CA',  '310-555-0102'),
('Green Valley Clinic',         'Clinic',         '300 Care Rd, Chicago, IL',            '312-555-0103'),
('Metro Diagnostic Lab',        'Laboratory',     '400 Test St, Houston, TX',            '713-555-0104'),
('Lakeside Orthopedics',        'Specialist',     '500 Bone Dr, Phoenix, AZ',            '602-555-0105'),
('Riverside Cardiology',        'Specialist',     '600 Heart Ln, Philadelphia, PA',      '215-555-0106'),
('Northside Neurology',         'Specialist',     '700 Brain Ave, San Antonio, TX',      '210-555-0107'),
('Westend Pharmacy',            'Pharmacy',       '800 Drug Blvd, San Diego, CA',        '619-555-0108'),
('Downtown Dental',             'Dental',         '900 Tooth Rd, Dallas, TX',            '214-555-0109'),
('Eastside Eye Care',           'Optometry',      '1000 Vision St, San Jose, CA',        '408-555-0110'),
('Harmony Mental Health',       'Mental Health',  '1100 Mind Dr, Austin, TX',            '512-555-0111'),
('Pinnacle Surgery Center',     'Surgery',        '1200 Scalpel Ave, Jacksonville, FL',  '904-555-0112'),
('Coastal Radiology',           'Radiology',      '1300 Xray Blvd, Fort Worth, TX',      '817-555-0113'),
('Summit Physical Therapy',     'Therapy',        '1400 Rehab Rd, Columbus, OH',         '614-555-0114'),
('Valley Urgent Care',          'Urgent Care',    '1500 Quick St, Charlotte, NC',        '704-555-0115'),
('Prestige Medical Group',      'Hospital',       '1600 Elite Ave, Indianapolis, IN',    '317-555-0116'),
('Pacific Health Partners',     'Clinic',         '1700 Ocean Blvd, San Francisco, CA',  '415-555-0117'),
('Mountain View Medical',       'Hospital',       '1800 Peak Dr, Seattle, WA',           '206-555-0118'),
('Skyline Dermatology',         'Specialist',     '1900 Skin Rd, Denver, CO',            '303-555-0119'),
('Heritage Family Practice',    'Clinic',         '2000 Family Ln, Nashville, TN',       '615-555-0120'),
('Apex Oncology Center',        'Specialist',     '2100 Cancer Ave, Oklahoma City, OK',  '405-555-0121'),
('Frontier Pediatrics',         'Pediatrics',     '2200 Child Blvd, El Paso, TX',        '915-555-0122'),
('Lakeview Gastroenterology',   'Specialist',     '2300 Gut Rd, Louisville, KY',         '502-555-0123'),
('Cascade Pulmonology',         'Specialist',     '2400 Lung St, Portland, OR',          '503-555-0124'),
('Desert Endocrinology',        'Specialist',     '2500 Hormone Dr, Las Vegas, NV',      '702-555-0125'),
('Bayou Nephrology',            'Specialist',     '2600 Kidney Ave, Memphis, TN',        '901-555-0126'),
('Harbor Rheumatology',         'Specialist',     '2700 Joint Blvd, Baltimore, MD',      '410-555-0127'),
('Lakefront Urology',           'Specialist',     '2800 Bladder Rd, Milwaukee, WI',      '414-555-0128'),
('Mesa Hematology',             'Specialist',     '2900 Blood St, Albuquerque, NM',      '505-555-0129'),
('Sonoran Infectious Disease',  'Specialist',     '3000 Virus Dr, Tucson, AZ',           '520-555-0130');

-- ============================================================
-- POLICY (30 rows)
-- ============================================================
INSERT INTO POLICY (POLICY_TYPE, START_DATE, END_DATE, COVERAGE_AMOUNT, PATIENT_ID) VALUES
('Individual',  '2023-01-01', '2024-12-31', 50000.00,  1),
('Family',      '2023-02-01', '2025-01-31', 150000.00, 2),
('Individual',  '2023-03-01', '2024-02-28', 75000.00,  3),
('Senior',      '2022-06-01', '2024-05-31', 100000.00, 4),
('Individual',  '2023-04-01', '2025-03-31', 60000.00,  5),
('Family',      '2023-05-01', '2025-04-30', 200000.00, 6),
('Individual',  '2023-06-01', '2024-05-31', 55000.00,  7),
('Senior',      '2022-07-01', '2024-06-30', 120000.00, 8),
('Individual',  '2023-07-01', '2025-06-30', 45000.00,  9),
('Family',      '2023-08-01', '2025-07-31', 175000.00, 10),
('Individual',  '2023-09-01', '2024-08-31', 65000.00,  11),
('Senior',      '2022-10-01', '2024-09-30', 110000.00, 12),
('Individual',  '2023-10-01', '2025-09-30', 50000.00,  13),
('Family',      '2023-11-01', '2025-10-31', 160000.00, 14),
('Individual',  '2023-12-01', '2024-11-30', 70000.00,  15),
('Senior',      '2022-01-01', '2024-12-31', 130000.00, 16),
('Individual',  '2024-01-01', '2025-12-31', 55000.00,  17),
('Family',      '2024-02-01', '2026-01-31', 180000.00, 18),
('Individual',  '2024-03-01', '2025-02-28', 60000.00,  19),
('Senior',      '2023-04-01', '2025-03-31', 115000.00, 20),
('Individual',  '2024-04-01', '2026-03-31', 50000.00,  21),
('Family',      '2024-05-01', '2026-04-30', 190000.00, 22),
('Individual',  '2024-06-01', '2025-05-31', 65000.00,  23),
('Senior',      '2023-07-01', '2025-06-30', 125000.00, 24),
('Individual',  '2024-07-01', '2026-06-30', 55000.00,  25),
('Family',      '2024-08-01', '2026-07-31', 170000.00, 26),
('Individual',  '2024-09-01', '2025-08-31', 60000.00,  27),
('Senior',      '2023-10-01', '2025-09-30', 105000.00, 28),
('Individual',  '2024-10-01', '2026-09-30', 50000.00,  29),
('Family',      '2024-11-01', '2026-10-31', 165000.00, 30);

-- ============================================================
-- FRAUD_RULE (6 rules)
-- ============================================================
INSERT INTO FRAUD_RULE (RULE_NAME, DESCRIPTION, THRESHOLD_VALUE) VALUES
('High Claim Amount',         'Claim amount exceeds the threshold indicating potential overbilling',                    10000.00),
('Frequent Claims',           'More than threshold number of claims from same policy within 30 days',                  3.00),
('Provider Overuse',          'Same provider has more than threshold claims in a 30-day window',                       5.00),
('Abnormal Diagnosis Repeat', 'Same diagnosis repeated more than threshold times for same patient within 60 days',     2.00),
('Claim Exceeds Coverage',    'Claim amount exceeds policy coverage amount',                                           1.00),
('Rapid Resubmission',        'Claim resubmitted within threshold days of a rejected claim for same diagnosis',        7.00);

-- ============================================================
-- CLAIM (35 rows — mix of normal and fraudulent)
-- ============================================================
INSERT INTO CLAIM (CLAIM_DATE, CLAIM_AMOUNT, APPROVED_AMOUNT, DIAGNOSIS, STATUS, POLICY_ID, PROVIDER_ID) VALUES
-- Normal claims
('2024-01-10',  2500.00,  2500.00, 'Hypertension',           'Approved',      1,  1),
('2024-01-15',  1800.00,  1800.00, 'Diabetes Type 2',        'Approved',      2,  2),
('2024-02-05',  3200.00,  3200.00, 'Appendicitis',           'Approved',      3,  3),
('2024-02-20',  950.00,   950.00,  'Common Cold',            'Approved',      4,  4),
('2024-03-08',  4500.00,  4500.00, 'Knee Replacement',       'Approved',      5,  5),
('2024-03-22',  2100.00,  2100.00, 'Cardiac Arrhythmia',     'Approved',      6,  6),
('2024-04-11',  1500.00,  1500.00, 'Migraine',               'Approved',      7,  7),
('2024-04-25',  3800.00,  3800.00, 'Gallbladder Removal',    'Approved',      8,  8),
('2024-05-14',  2200.00,  2200.00, 'Asthma',                 'Approved',      9,  9),
('2024-05-28',  1200.00,  1200.00, 'Dental Cavity',          'Approved',      10, 10),
-- Fraudulent: High Claim Amount
('2024-06-03',  45000.00, 0.00,    'Spinal Surgery',         'Under Review',  11, 11),
('2024-06-10',  38000.00, 0.00,    'Brain Tumor Removal',    'Under Review',  12, 12),
('2024-06-18',  52000.00, 0.00,    'Heart Bypass Surgery',   'Under Review',  13, 13),
-- Fraudulent: Frequent Claims (same policy, short window)
('2024-07-01',  3000.00,  0.00,    'Back Pain',              'Pending',       14, 14),
('2024-07-05',  2800.00,  0.00,    'Back Pain',              'Pending',       14, 15),
('2024-07-09',  3100.00,  0.00,    'Back Pain',              'Pending',       14, 16),
('2024-07-12',  2900.00,  0.00,    'Back Pain',              'Pending',       14, 17),
-- Fraudulent: Provider Overuse (same provider)
('2024-08-01',  5000.00,  0.00,    'Fracture Treatment',     'Pending',       15, 1),
('2024-08-03',  4800.00,  0.00,    'Fracture Treatment',     'Pending',       16, 1),
('2024-08-05',  5200.00,  0.00,    'Fracture Treatment',     'Pending',       17, 1),
('2024-08-07',  4900.00,  0.00,    'Fracture Treatment',     'Pending',       18, 1),
('2024-08-09',  5100.00,  0.00,    'Fracture Treatment',     'Pending',       19, 1),
('2024-08-11',  5300.00,  0.00,    'Fracture Treatment',     'Pending',       20, 1),
-- Fraudulent: Abnormal Diagnosis Repeat
('2024-09-01',  2000.00,  0.00,    'Chest Pain',             'Pending',       21, 21),
('2024-09-10',  2100.00,  0.00,    'Chest Pain',             'Pending',       21, 22),
('2024-09-18',  1950.00,  0.00,    'Chest Pain',             'Pending',       21, 23),
-- Normal claims continued
('2024-10-01',  1700.00,  1700.00, 'Flu',                    'Approved',      22, 22),
('2024-10-15',  2900.00,  2900.00, 'Pneumonia',              'Approved',      23, 23),
('2024-10-28',  3500.00,  3500.00, 'Hernia Repair',          'Approved',      24, 24),
('2024-11-05',  1100.00,  1100.00, 'Ear Infection',          'Approved',      25, 25),
-- High amount fraudulent
('2024-11-12',  75000.00, 0.00,    'Experimental Treatment', 'Under Review',  26, 26),
('2024-11-20',  22000.00, 0.00,    'Multiple Organ Failure', 'Under Review',  27, 27),
-- Normal
('2024-12-01',  4200.00,  4200.00, 'Cataract Surgery',       'Approved',      28, 28),
('2024-12-10',  1600.00,  1600.00, 'Skin Rash',              'Approved',      29, 29),
('2024-12-20',  2700.00,  2700.00, 'Kidney Stone',           'Approved',      30, 30);
