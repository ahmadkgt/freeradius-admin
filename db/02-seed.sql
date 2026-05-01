-- Sample seed data for FreeRADIUS Admin

-- Groups
INSERT INTO radgroupcheck (groupname, attribute, op, value) VALUES
  ('admins', 'Auth-Type', ':=', 'PAP'),
  ('users', 'Auth-Type', ':=', 'PAP'),
  ('vip', 'Auth-Type', ':=', 'PAP');

INSERT INTO radgroupreply (groupname, attribute, op, value) VALUES
  ('admins', 'Session-Timeout', ':=', '86400'),
  ('admins', 'Idle-Timeout', ':=', '600'),
  ('users', 'Session-Timeout', ':=', '7200'),
  ('users', 'Idle-Timeout', ':=', '300'),
  ('vip', 'Session-Timeout', ':=', '604800'),
  ('vip', 'Mikrotik-Rate-Limit', ':=', '50M/50M');

-- Users (passwords are Cleartext-Password for demo only)
INSERT INTO radcheck (username, attribute, op, value) VALUES
  ('alice',     'Cleartext-Password', ':=', 'alice123'),
  ('bob',       'Cleartext-Password', ':=', 'bob12345'),
  ('charlie',   'Cleartext-Password', ':=', 'charlie!'),
  ('ahmad',     'Cleartext-Password', ':=', 'ahmad@2024'),
  ('fatima',    'Cleartext-Password', ':=', 'fatima@2024'),
  ('omar',      'Cleartext-Password', ':=', 'omar@2024'),
  ('layla',     'Cleartext-Password', ':=', 'layla@2024');

INSERT INTO radreply (username, attribute, op, value) VALUES
  ('alice',  'Framed-IP-Address', ':=', '10.10.0.10'),
  ('bob',    'Framed-IP-Address', ':=', '10.10.0.11'),
  ('ahmad',  'Framed-IP-Address', ':=', '10.10.0.20');

INSERT INTO radusergroup (username, groupname, priority) VALUES
  ('alice',   'admins', 1),
  ('bob',     'users',  1),
  ('charlie', 'users',  1),
  ('ahmad',   'admins', 1),
  ('fatima',  'vip',    1),
  ('omar',    'users',  1),
  ('layla',   'vip',    1);

-- NAS / RADIUS clients
INSERT INTO nas (nasname, shortname, type, ports, secret, description) VALUES
  ('192.168.1.1',   'router-main',   'mikrotik', 1812, 'testing123', 'Main MikroTik router'),
  ('192.168.1.2',   'ap-office',     'cisco',    1812, 'testing456', 'Office Cisco access point'),
  ('10.0.0.1',      'gw-branch',     'other',    1812, 'testing789', 'Branch office gateway'),
  ('172.16.0.1',    'wifi-guest',    'other',    1812, 'guest12345', 'Guest WiFi controller');

-- Accounting / sessions (mix of closed and active)
INSERT INTO radacct
  (acctsessionid, acctuniqueid, username, groupname, nasipaddress, nasporttype,
   acctstarttime, acctupdatetime, acctstoptime, acctsessiontime, acctauthentic,
   acctinputoctets, acctoutputoctets, calledstationid, callingstationid,
   acctterminatecause, servicetype, framedprotocol, framedipaddress)
VALUES
  ('S001', 'U001', 'alice',   'admins', '192.168.1.1', 'Wireless-802.11',
   NOW() - INTERVAL 2 DAY, NOW() - INTERVAL 2 DAY + INTERVAL 30 MINUTE, NOW() - INTERVAL 2 DAY + INTERVAL 30 MINUTE,
   1800, 'PAP', 1024000, 5120000, '00-11-22-33-44-55', 'AA-BB-CC-DD-EE-01', 'User-Request', 'Framed-User', 'PPP', '10.10.0.10'),

  ('S002', 'U002', 'bob',     'users',  '192.168.1.1', 'Wireless-802.11',
   NOW() - INTERVAL 1 DAY, NOW() - INTERVAL 1 DAY + INTERVAL 1 HOUR, NOW() - INTERVAL 1 DAY + INTERVAL 1 HOUR,
   3600, 'PAP', 5242880, 26214400, '00-11-22-33-44-55', 'AA-BB-CC-DD-EE-02', 'Idle-Timeout', 'Framed-User', 'PPP', '10.10.0.11'),

  ('S003', 'U003', 'charlie', 'users',  '192.168.1.2', 'Ethernet',
   NOW() - INTERVAL 5 HOUR, NOW() - INTERVAL 5 HOUR + INTERVAL 2 HOUR, NOW() - INTERVAL 5 HOUR + INTERVAL 2 HOUR,
   7200, 'PAP', 10485760, 52428800, '00-11-22-33-44-66', 'AA-BB-CC-DD-EE-03', 'NAS-Reboot', 'Framed-User', 'PPP', '10.10.0.12'),

  -- Active sessions (no stop time)
  ('S100', 'A100', 'ahmad',   'admins', '192.168.1.1', 'Wireless-802.11',
   NOW() - INTERVAL 90 MINUTE, NOW() - INTERVAL 1 MINUTE, NULL,
   5400, 'PAP', 8388608, 41943040, '00-11-22-33-44-55', 'AA-BB-CC-DD-EE-AH', '', 'Framed-User', 'PPP', '10.10.0.20'),

  ('S101', 'A101', 'fatima',  'vip',    '192.168.1.2', 'Wireless-802.11',
   NOW() - INTERVAL 30 MINUTE, NOW() - INTERVAL 1 MINUTE, NULL,
   1800, 'PAP', 2097152, 20971520, '00-11-22-33-44-66', 'AA-BB-CC-DD-EE-FT', '', 'Framed-User', 'PPP', '10.10.0.30'),

  ('S102', 'A102', 'layla',   'vip',    '172.16.0.1',  'Wireless-802.11',
   NOW() - INTERVAL 10 MINUTE, NOW() - INTERVAL 1 MINUTE, NULL,
   600, 'PAP', 524288, 5242880, '00-11-22-33-44-77', 'AA-BB-CC-DD-EE-LY', '', 'Framed-User', 'PPP', '10.10.0.31');

-- Post-auth log
INSERT INTO radpostauth (username, pass, reply, authdate) VALUES
  ('alice',   'alice123',    'Access-Accept', NOW() - INTERVAL 2 DAY),
  ('bob',     'bob12345',    'Access-Accept', NOW() - INTERVAL 1 DAY),
  ('charlie', 'wrongpass',   'Access-Reject', NOW() - INTERVAL 6 HOUR),
  ('charlie', 'charlie!',    'Access-Accept', NOW() - INTERVAL 5 HOUR),
  ('ahmad',   'ahmad@2024',  'Access-Accept', NOW() - INTERVAL 90 MINUTE),
  ('fatima',  'fatima@2024', 'Access-Accept', NOW() - INTERVAL 30 MINUTE),
  ('layla',   'layla@2024',  'Access-Accept', NOW() - INTERVAL 10 MINUTE),
  ('omar',    'wrongpass',   'Access-Reject', NOW() - INTERVAL 15 MINUTE);
