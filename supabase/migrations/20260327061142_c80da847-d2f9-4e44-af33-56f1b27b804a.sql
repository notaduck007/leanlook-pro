
-- Clean up duplicate look-aheads, keep only 4c2ffcc6 as "Week 1"
DELETE FROM lookahead_lines WHERE lookahead_id IN (
  'cda11dfd-8a6d-4556-9bf4-e8267a66062f',
  'd35e9b27-213b-4e89-bc46-7cb632cdf277', 
  'be88e4f0-3b6f-4c27-9aba-7fb50b2ab734',
  '6147034b-52db-41ee-b2d8-a7821fcd4749',
  'd483c8c2-a35e-40c4-a6b3-b1c48ebc0d1f'
);
DELETE FROM look_aheads WHERE id IN (
  'cda11dfd-8a6d-4556-9bf4-e8267a66062f',
  'd35e9b27-213b-4e89-bc46-7cb632cdf277',
  'be88e4f0-3b6f-4c27-9aba-7fb50b2ab734',
  '6147034b-52db-41ee-b2d8-a7821fcd4749',
  'd483c8c2-a35e-40c4-a6b3-b1c48ebc0d1f'
);

-- Delete ALL existing lines for the test lookahead so we can set up clean test data
DELETE FROM lookahead_lines WHERE lookahead_id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb';

-- Update Week 1 to March 16 start date as per test scenario
UPDATE look_aheads SET week_start_date = '2026-03-16', status = 'submitted'
WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb';

-- Get company_id for inserts
-- company_id from the look_ahead record is needed. We'll use a subquery.

-- 1. Parent task "Install Drywall" with 3 subtasks
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, status_per_day, assigned_trade)
VALUES (
  'a0000001-0000-0000-0000-000000000001',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Install Drywall',
  0,
  '{}',
  'Drywall Contractor'
);

-- Subtask 1: Complete (Y on all 5 weekdays of working week)
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, parent_line_id, status_per_day, assigned_trade)
VALUES (
  'a0000001-0000-0000-0000-000000000002',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Frame inspection',
  1,
  'a0000001-0000-0000-0000-000000000001',
  '{"2026-03-16":"Y","2026-03-17":"Y","2026-03-18":"Y","2026-03-19":"Y","2026-03-20":"Y"}',
  'Drywall Contractor'
);

-- Subtask 2: Partially complete (Y on some, N on others)
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, parent_line_id, status_per_day, assigned_trade)
VALUES (
  'a0000001-0000-0000-0000-000000000003',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Hang drywall',
  2,
  'a0000001-0000-0000-0000-000000000001',
  '{"2026-03-16":"Y","2026-03-17":"Y","2026-03-18":"N","2026-03-19":"N","2026-03-20":"planned"}',
  'Drywall Contractor'
);

-- Subtask 3: Not started (all planned)
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, parent_line_id, status_per_day, assigned_trade)
VALUES (
  'a0000001-0000-0000-0000-000000000004',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Tape & mud',
  3,
  'a0000001-0000-0000-0000-000000000001',
  '{"2026-03-16":"planned","2026-03-17":"planned","2026-03-18":"planned","2026-03-19":"planned","2026-03-20":"planned"}',
  'Drywall Contractor'
);

-- 2. Standalone task 100% complete
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, status_per_day, assigned_trade)
VALUES (
  'a0000001-0000-0000-0000-000000000005',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Pour Foundation',
  4,
  '{"2026-03-16":"Y","2026-03-17":"Y","2026-03-18":"Y","2026-03-19":"Y","2026-03-20":"Y"}',
  'Concrete'
);

-- 3. Standalone task 0% complete (all planned, no actuals)
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, status_per_day, assigned_trade)
VALUES (
  'a0000001-0000-0000-0000-000000000006',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Install HVAC Ductwork',
  5,
  '{"2026-03-16":"planned","2026-03-17":"planned","2026-03-18":"planned","2026-03-19":"planned","2026-03-20":"planned"}',
  'HVAC'
);

-- 4. Standalone task 60% complete (3 Y, 2 N out of 5)
INSERT INTO lookahead_lines (id, lookahead_id, company_id, custom_text, sort_order, status_per_day, assigned_trade, notes)
VALUES (
  'a0000001-0000-0000-0000-000000000007',
  '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb',
  (SELECT company_id FROM look_aheads WHERE id = '4c2ffcc6-a0f8-4a25-a3b4-8528e5b9acdb'),
  'Electrical Rough-In',
  6,
  '{"2026-03-16":"Y","2026-03-17":"Y","2026-03-18":"Y","2026-03-19":"N","2026-03-20":"N"}',
  'Electrical',
  'Waiting on panel delivery'
);
