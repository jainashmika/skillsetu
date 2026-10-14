// Demo data: taxonomy, admin, employers, seekers, jobs, portals, content. Run: npm run seed
const bcrypt = require('bcryptjs');
const { db, one, run } = require('./index');
const { encrypt, hmac, maskPhone } = require('../utils/crypto');
const gov = require('../services/integrations/gov');

const SKILLS = [
  ['JavaScript', 'Software', ['js', 'es6']], ['React', 'Software', ['reactjs', 'react.js']], ['Node.js', 'Software', ['node', 'nodejs', 'express']], ['Python', 'Software', ['py']],
  ['Java', 'Software', []], ['Spring Boot', 'Software', ['spring']], ['SQL', 'Data', ['mysql', 'postgresql', 'postgres']], ['Data Analysis', 'Data', ['data analytics', 'analytics']],
  ['Machine Learning', 'Data', ['ml']], ['MS Excel', 'Office', ['excel', 'advanced excel']], ['Tally ERP', 'Finance', ['tally', 'tally prime']], ['Accounting', 'Finance', ['accounts', 'bookkeeping']],
  ['GST Filing', 'Finance', ['gst', 'gst returns']], ['Digital Marketing', 'Marketing', ['online marketing']], ['SEO', 'Marketing', ['search engine optimization']], ['Social Media', 'Marketing', ['social media marketing', 'smm']],
  ['Customer Service', 'Service', ['customer support', 'customer care']], ['Communication', 'General', ['communication skills']], ['Sales', 'Sales', ['field sales', 'b2b sales']], ['Team Leadership', 'General', ['team management', 'leadership']],
  ['Inventory Management', 'Logistics', ['inventory', 'warehouse management', 'wms']], ['Supply Chain', 'Logistics', ['scm', 'logistics']], ['Electrical Wiring', 'Trades', ['wiring', 'electrician']], ['Safety Compliance', 'Trades', ['safety', 'ehs']],
  ['CNC Operation', 'Manufacturing', ['cnc', 'cnc machining']], ['Welding', 'Trades', ['arc welding', 'mig welding']], ['AutoCAD', 'Engineering', ['cad']], ['Nursing', 'Healthcare', ['patient care', 'gnm']],
  ['Hindi', 'Language', []], ['Kannada', 'Language', []], ['Data Entry', 'Office', ['typing']], ['REST APIs', 'Software', ['rest', 'api development']], ['Cloud (AWS)', 'Software', ['aws', 'cloud']], ['Retail Operations', 'Service', ['retail', 'store operations']], ['Driving (LMV)', 'Trades', ['driving', 'driver', 'lmv']],
  ['TypeScript', 'Software', ['ts']], ['Android Development', 'Software', ['android', 'kotlin']], ['Flutter', 'Software', ['dart']], ['Software Testing', 'Software', ['qa', 'manual testing', 'selenium']], ['Git', 'Software', ['github', 'version control']],
  ['Power BI', 'Data', ['powerbi', 'tableau', 'dashboards']], ['Statistics', 'Data', []], ['UI/UX Design', 'Design', ['figma', 'ui design', 'ux']], ['Graphic Design', 'Design', ['photoshop', 'canva', 'illustrator']], ['Content Writing', 'Marketing', ['copywriting', 'blogging']],
  ['Telecalling', 'Sales', ['telesales', 'cold calling']], ['Banking Operations', 'Finance', ['kyc', 'branch operations']], ['Payroll', 'Finance', ['salary processing']], ['Recruitment', 'HR', ['hiring', 'talent acquisition']], ['HR Operations', 'HR', ['onboarding', 'hr admin']],
  ['Plumbing', 'Trades', ['plumber']], ['Machine Maintenance', 'Manufacturing', ['maintenance', 'preventive maintenance']], ['Quality Control', 'Manufacturing', ['qc', 'quality inspection', 'qa/qc']], ['Forklift Operation', 'Logistics', ['forklift']], ['Site Supervision', 'Construction', ['site engineer', 'civil supervision']],
  ['Pharmacy', 'Healthcare', ['pharmacist', 'd.pharm', 'b.pharm']], ['Lab Technician', 'Healthcare', ['dmlt', 'lab technician', 'pathology']], ['Teaching', 'Education', ['teacher', 'tutoring', 'b.ed']], ['Cooking', 'Hospitality', ['chef', 'commis', 'kitchen']], ['Front Desk', 'Hospitality', ['receptionist', 'front office']],
  ['English', 'Language', ['spoken english']], ['Tamil', 'Language', []], ['Marathi', 'Language', []], ['Telugu', 'Language', []],
];
const SECTORS = ['IT & Software', 'Manufacturing', 'Logistics', 'Banking & Finance', 'Healthcare', 'Retail', 'Marketing', 'Construction', 'Education', 'Hospitality', 'Human Resources', 'Design & Media'];
const COMPANIES = [
  ['Finlytics Pvt Ltd', 'IT & Software', 'Bengaluru', '29', 'AAACF1234K'], ['Shakti Engineering Works', 'Manufacturing', 'Coimbatore', '33', 'AAFCS4321M'], ['Acme Logistics', 'Logistics', 'Pune', '27', 'AABCA7788P'],
  ['Sahyog Small Finance Bank', 'Banking & Finance', 'Mumbai', '27', 'AADCS5566Q'], ['Arogya Hospitals', 'Healthcare', 'Hyderabad', '36', 'AAECA9911R'], ['BrightCart Retail', 'Retail', 'Delhi', '07', 'AAGCB2233S'],
  ['CodeNest Technologies', 'IT & Software', 'Hyderabad', '36', 'AAHCC1122T'], ['Pixel Forge Studios', 'Design & Media', 'Pune', '27', 'AAICP3344U'], ['Bharat Build Infra', 'Construction', 'Chennai', '33', 'AAJCB5566V'],
  ['GreenLeaf Hotels', 'Hospitality', 'Jaipur', '08', 'AAKCG7788W'], ['Vidya Learning Centres', 'Education', 'Lucknow', '09', 'AALCV9900X'], ['MedPlus Diagnostics', 'Healthcare', 'Bengaluru', '29', 'AAMCM1212Y'],
  ['SwiftMove Logistics', 'Logistics', 'Ahmedabad', '24', 'AANCS3434Z'], ['PeopleFirst HR Services', 'Human Resources', 'Gurugram', '06', 'AAOCP5656A'], ['Kaveri Auto Components', 'Manufacturing', 'Mysuru', '29', 'AAPCK7878B'],
  ['UrbanBasket', 'Retail', 'Kolkata', '19', 'AAQCU9090C'], ['Nimbus Cloud Labs', 'IT & Software', 'Noida', '09', 'AARCN2121D'], ['Jan Seva Finance', 'Banking & Finance', 'Indore', '23', 'AASCJ4343E'],
  ['Konark Analytics', 'IT & Software', 'Bhubaneswar', '21', 'AATCK6565F'], ['Brahmaputra Foods', 'Hospitality', 'Guwahati', '18', 'AAUCB8787G'], ['Malabar Care Hospitals', 'Healthcare', 'Kochi', '32', 'AAVCM1010H'],
  ['Sabarmati Textiles', 'Manufacturing', 'Surat', '24', 'AAWCS3232J'], ['Deccan Retail Mart', 'Retail', 'Hyderabad', '36', 'AAXCD5454K'], ['Himalaya Staffing', 'Human Resources', 'Chandigarh', '04', 'AAYCH7676L'],
  ['Ganga Infra Projects', 'Construction', 'Patna', '10', 'AAZCG9898M'], ['Coastal Freight Lines', 'Logistics', 'Visakhapatnam', '37', 'AABCC1313N'], ['Pragati Credit Society', 'Banking & Finance', 'Nagpur', '27', 'AACCP2424P'],
  ['BlueOrbit Media', 'Design & Media', 'Mumbai', '27', 'AADCB3535Q'], ['Shiksha Plus Academy', 'Education', 'Bhopal', '23', 'AAECS4646R'], ['Tricolour Marketing', 'Marketing', 'Delhi', '07', 'AAFCT5757S'],
];
const JOBS = [
  [0, 'Frontend Developer (React)', 'Build accessible, fast React interfaces for a lending platform used across India. Work with designers and backend engineers, write tests and ship weekly.', ['React', 'JavaScript', 'REST APIs'], ['SQL'], 'hybrid', 600000, 1200000, 1, 5],
  [0, 'Backend Engineer (Node.js)', 'Design REST APIs in Node.js, model data in SQL and run services on AWS. You will own reliability for payment and KYC flows.', ['Node.js', 'SQL', 'REST APIs'], ['Cloud (AWS)'], 'remote', 800000, 1600000, 2, 5],
  [0, 'Data Analyst Intern', 'Clean and analyse loan performance data with SQL and Python, build Excel dashboards for the risk team. Six-month paid internship.', ['SQL', 'Data Analysis'], ['Python', 'MS Excel'], 'onsite', 240000, 300000, 0, 5, 'internship'],
  [1, 'CNC Machine Operator', 'Operate and set up CNC lathes and VMCs, read drawings, maintain quality records and follow shop-floor safety norms.', ['CNC Operation', 'Safety Compliance'], ['AutoCAD'], 'onsite', 216000, 300000, 1, 3],
  [1, 'Electrician (ITI)', 'Install and maintain industrial wiring and panels. ITI electricians and apprentices welcome; training provided on plant systems.', ['Electrical Wiring', 'Safety Compliance'], [], 'onsite', 180000, 264000, 0, 3, 'apprenticeship'],
  [1, 'Welder', 'MIG and arc welding of fabricated structures to drawing. Two years shop experience preferred.', ['Welding', 'Safety Compliance'], [], 'onsite', 200000, 280000, 2, 3],
  [2, 'Warehouse Supervisor', 'Supervise inbound/outbound operations, lead a team of 12 and keep inventory accuracy above 99% using the WMS.', ['Inventory Management', 'Team Leadership'], ['MS Excel', 'Supply Chain'], 'onsite', 300000, 420000, 2, 4],
  [2, 'Delivery Executive', 'Deliver parcels across Pune city routes using company vehicles. Valid LMV licence required; fuel and incentives paid.', ['Driving (LMV)', 'Customer Service'], ['Hindi'], 'onsite', 180000, 240000, 0, 1, 'full_time'],
  [3, 'Relationship Officer', 'Open savings accounts and sell micro-loans to customers in your branch area. Hindi or Marathi speakers preferred.', ['Sales', 'Customer Service', 'Communication'], ['Hindi'], 'onsite', 250000, 350000, 0, 5],
  [3, 'Accounts Executive', 'Handle vouchers, reconciliations and monthly GST returns in Tally. B.Com graduates with 1+ year experience.', ['Accounting', 'Tally ERP', 'GST Filing'], ['MS Excel'], 'onsite', 280000, 400000, 1, 5],
  [4, 'Staff Nurse', 'Provide patient care in medical and surgical wards, maintain records and support doctors during rounds. GNM/B.Sc Nursing.', ['Nursing', 'Communication'], ['Hindi'], 'onsite', 300000, 420000, 0, 4],
  [4, 'Front Office Executive', 'Manage patient registration, appointments and billing desk. Good communication in English and Telugu or Hindi.', ['Customer Service', 'Communication', 'Data Entry'], ['MS Excel'], 'onsite', 200000, 260000, 0, 2],
  [5, 'Store Associate', 'Help customers on the floor, manage billing and restock shelves at our Delhi stores. Freshers welcome.', ['Retail Operations', 'Customer Service'], ['Hindi'], 'onsite', 180000, 220000, 0, 1, 'full_time'],
  [5, 'Digital Marketing Executive', 'Run social media and search campaigns, track SEO and conversion metrics and report weekly to the brand team.', ['Digital Marketing', 'SEO', 'Social Media'], ['MS Excel'], 'hybrid', 300000, 500000, 1, 5],
  [0, 'Machine Learning Engineer', 'Build credit-scoring models in Python, deploy them behind APIs and monitor drift. Experience with SQL and AWS is a plus.', ['Python', 'Machine Learning', 'SQL'], ['Cloud (AWS)'], 'hybrid', 1200000, 2200000, 2, 6],
];
const SEEKERS = [
  ['Priya Sharma', 'priya@example.in', '9876500001', 'Bengaluru', 5, 2, ['React', 'JavaScript', 'REST APIs', 'SQL'], 'Frontend developer, React', 700000, 'B.Tech', 2022],
  ['Arjun Reddy', 'arjun@example.in', '9876500002', 'Hyderabad', 5, 3, ['Node.js', 'SQL', 'Cloud (AWS)', 'Python'], 'Backend developer', 1000000, 'B.E.', 2021],
  ['Meena Kumari', 'meena@example.in', '9876500003', 'Coimbatore', 3, 1, ['Electrical Wiring', 'Safety Compliance'], 'ITI Electrician', 200000, 'ITI', 2023],
  ['Rahul Verma', 'rahul@example.in', '9876500004', 'Delhi', 2, 0, ['Customer Service', 'Retail Operations', 'Hindi'], 'Fresher, retail', 180000, '12th', 2024],
  ['Sneha Patil', 'sneha@example.in', '9876500005', 'Pune', 5, 1, ['Accounting', 'Tally ERP', 'MS Excel', 'GST Filing'], 'Accounts executive', 300000, 'B.Com', 2023],
  ['Imran Khan', 'imran@example.in', '9876500006', 'Mumbai', 5, 0, ['Sales', 'Communication', 'Hindi'], 'Sales fresher', 250000, 'BBA', 2025],
  ['Lakshmi Nair', 'lakshmi@example.in', '9876500007', 'Kochi', 5, 2, ['Nursing', 'Communication'], 'Staff nurse, B.Sc Nursing', 320000, 'B.Sc', 2022],
  ['Vikram Singh', 'vikram@example.in', '9876500008', 'Pune', 4, 4, ['Inventory Management', 'Team Leadership', 'Supply Chain'], 'Warehouse lead', 380000, 'Diploma', 2018],
];


// ---- Generated volume: role templates produce many overlapping jobs and candidates ----
// [title, sector, required skills, nice-to-have skills, edu level, min exp, ctcMin, ctcMax, contract, work format]
const ROLES = [
  ['Full Stack Developer', 'IT & Software', ['JavaScript', 'React', 'Node.js'], ['SQL', 'Git', 'TypeScript'], 5, 1, 500000, 1100000, 'full_time', 'hybrid'],
  ['Junior Web Developer', 'IT & Software', ['JavaScript', 'React'], ['Git', 'REST APIs'], 5, 0, 300000, 500000, 'full_time', 'onsite'],
  ['Python Developer', 'IT & Software', ['Python', 'SQL'], ['REST APIs', 'Cloud (AWS)', 'Git'], 5, 1, 450000, 900000, 'full_time', 'remote'],
  ['Android Developer', 'IT & Software', ['Android Development', 'Java'], ['Flutter', 'Git', 'REST APIs'], 5, 1, 450000, 950000, 'full_time', 'hybrid'],
  ['QA Tester', 'IT & Software', ['Software Testing'], ['SQL', 'Git', 'JavaScript'], 5, 0, 300000, 550000, 'full_time', 'onsite'],
  ['Software Engineering Intern', 'IT & Software', ['JavaScript', 'Git'], ['Python', 'React', 'SQL'], 5, 0, 180000, 300000, 'internship', 'hybrid'],
  ['Data Analyst', 'IT & Software', ['SQL', 'Data Analysis', 'MS Excel'], ['Power BI', 'Python', 'Statistics'], 5, 1, 400000, 800000, 'full_time', 'hybrid'],
  ['Business Intelligence Analyst', 'Banking & Finance', ['Power BI', 'SQL'], ['Data Analysis', 'MS Excel'], 5, 2, 600000, 1100000, 'full_time', 'onsite'],
  ['UI/UX Designer', 'Design & Media', ['UI/UX Design'], ['Graphic Design', 'Communication'], 5, 1, 400000, 900000, 'full_time', 'hybrid'],
  ['Graphic Designer', 'Design & Media', ['Graphic Design'], ['Social Media', 'UI/UX Design'], 4, 0, 250000, 450000, 'full_time', 'onsite'],
  ['Content Writer', 'Marketing', ['Content Writing', 'English'], ['SEO', 'Social Media'], 5, 0, 250000, 450000, 'full_time', 'remote'],
  ['Social Media Executive', 'Marketing', ['Social Media', 'Digital Marketing'], ['Content Writing', 'Graphic Design'], 5, 0, 250000, 420000, 'full_time', 'hybrid'],
  ['Telecaller', 'Retail', ['Telecalling', 'Communication'], ['Hindi', 'Customer Service', 'English'], 2, 0, 150000, 220000, 'full_time', 'onsite'],
  ['Customer Support Executive', 'IT & Software', ['Customer Service', 'Communication', 'English'], ['Data Entry', 'Hindi'], 2, 0, 200000, 300000, 'full_time', 'onsite'],
  ['Sales Executive', 'Retail', ['Sales', 'Communication'], ['Customer Service', 'Hindi'], 2, 0, 200000, 350000, 'full_time', 'onsite'],
  ['Branch Operations Officer', 'Banking & Finance', ['Banking Operations', 'Customer Service'], ['MS Excel', 'Communication'], 5, 0, 280000, 400000, 'full_time', 'onsite'],
  ['Accountant', 'Banking & Finance', ['Accounting', 'Tally ERP'], ['GST Filing', 'MS Excel', 'Payroll'], 5, 1, 260000, 420000, 'full_time', 'onsite'],
  ['Payroll Executive', 'Human Resources', ['Payroll', 'MS Excel'], ['Accounting', 'HR Operations'], 5, 1, 280000, 420000, 'full_time', 'onsite'],
  ['HR Recruiter', 'Human Resources', ['Recruitment', 'Communication'], ['HR Operations', 'MS Excel'], 5, 0, 250000, 450000, 'full_time', 'hybrid'],
  ['Data Entry Operator', 'Banking & Finance', ['Data Entry', 'MS Excel'], ['English', 'Hindi'], 2, 0, 150000, 220000, 'full_time', 'onsite'],
  ['Maintenance Technician', 'Manufacturing', ['Machine Maintenance', 'Safety Compliance'], ['Electrical Wiring'], 3, 1, 200000, 320000, 'full_time', 'onsite'],
  ['Quality Inspector', 'Manufacturing', ['Quality Control', 'Safety Compliance'], ['MS Excel', 'AutoCAD'], 4, 1, 220000, 360000, 'full_time', 'onsite'],
  ['Production Trainee', 'Manufacturing', ['Safety Compliance'], ['CNC Operation', 'Quality Control'], 3, 0, 160000, 220000, 'apprenticeship', 'onsite'],
  ['Plumber', 'Construction', ['Plumbing', 'Safety Compliance'], [], 3, 1, 180000, 280000, 'contract', 'onsite'],
  ['Site Supervisor', 'Construction', ['Site Supervision', 'Team Leadership'], ['AutoCAD', 'Safety Compliance'], 4, 2, 300000, 500000, 'full_time', 'onsite'],
  ['Forklift Operator', 'Logistics', ['Forklift Operation', 'Safety Compliance'], ['Inventory Management'], 1, 1, 180000, 250000, 'full_time', 'onsite'],
  ['Inventory Executive', 'Logistics', ['Inventory Management', 'MS Excel'], ['Supply Chain', 'Data Entry'], 4, 0, 220000, 340000, 'full_time', 'onsite'],
  ['Pharmacist', 'Healthcare', ['Pharmacy', 'Customer Service'], ['Data Entry'], 4, 0, 220000, 360000, 'full_time', 'onsite'],
  ['Lab Technician', 'Healthcare', ['Lab Technician', 'Safety Compliance'], ['Data Entry'], 4, 0, 200000, 320000, 'full_time', 'onsite'],
  ['Primary School Teacher', 'Education', ['Teaching', 'Communication', 'English'], ['Hindi'], 5, 0, 220000, 360000, 'full_time', 'onsite'],
  ['Online Tutor', 'Education', ['Teaching', 'English'], ['Communication', 'MS Excel'], 5, 0, 180000, 360000, 'part_time', 'remote'],
  ['Commis Chef', 'Hospitality', ['Cooking', 'Safety Compliance'], ['Team Leadership'], 2, 0, 180000, 260000, 'full_time', 'onsite'],
  ['Hotel Front Desk Associate', 'Hospitality', ['Front Desk', 'Customer Service', 'English'], ['Hindi', 'Communication'], 2, 0, 180000, 260000, 'full_time', 'onsite'],
  ['Store Manager', 'Retail', ['Retail Operations', 'Team Leadership', 'Sales'], ['Inventory Management', 'MS Excel'], 5, 3, 350000, 550000, 'full_time', 'onsite'],
  ['Senior Software Engineer', 'IT & Software', ['JavaScript', 'Node.js', 'React', 'Cloud (AWS)'], ['TypeScript', 'SQL', 'Git'], 5, 4, 1500000, 2800000, 'full_time', 'hybrid'],
  ['DevOps Engineer', 'IT & Software', ['Cloud (AWS)', 'Git', 'Python'], ['REST APIs', 'SQL'], 5, 2, 900000, 1800000, 'full_time', 'remote'],
  ['Product Analyst', 'IT & Software', ['SQL', 'Data Analysis', 'Statistics'], ['Power BI', 'Python'], 5, 1, 700000, 1400000, 'full_time', 'hybrid'],
  ['Marketing Manager', 'Marketing', ['Digital Marketing', 'SEO', 'Team Leadership'], ['Social Media', 'Content Writing'], 6, 4, 1000000, 1800000, 'full_time', 'hybrid'],
  ['Relationship Manager', 'Banking & Finance', ['Banking Operations', 'Sales', 'Communication'], ['MS Excel', 'Hindi'], 5, 2, 450000, 750000, 'full_time', 'onsite'],
  ['Delivery Executive', 'Logistics', ['Driving (LMV)', 'Customer Service'], ['Hindi'], 1, 0, 180000, 260000, 'full_time', 'onsite'],
  ['Staff Nurse', 'Healthcare', ['Nursing', 'Communication'], ['English', 'Hindi'], 4, 0, 250000, 400000, 'full_time', 'onsite'],
  ['Electrician', 'Construction', ['Electrical Wiring', 'Safety Compliance'], ['Machine Maintenance'], 3, 0, 180000, 280000, 'full_time', 'onsite'],
  ['Warehouse Associate', 'Logistics', ['Inventory Management'], ['Forklift Operation', 'Data Entry'], 1, 0, 160000, 230000, 'full_time', 'onsite'],
  ['Field Sales Officer', 'Banking & Finance', ['Sales', 'Driving (LMV)', 'Communication'], ['Hindi', 'Customer Service'], 2, 0, 220000, 340000, 'full_time', 'onsite'],
];
// Roles posted in every city, so each city has a broad base of jobs.
const CORE_ROLES = ['Customer Support Executive', 'Sales Executive', 'Data Entry Operator', 'Delivery Executive', 'Accountant', 'Telecaller', 'Staff Nurse', 'Full Stack Developer', 'Electrician'];
const HIGH_PAY_ROLES = ['Senior Software Engineer', 'DevOps Engineer', 'Marketing Manager'];
const PORTALS_FOR_JOBS = ['naukri-demo', 'ncs'];
const FIRST = ['Aarav', 'Ananya', 'Vivaan', 'Diya', 'Aditya', 'Ishita', 'Kabir', 'Saanvi', 'Arjun', 'Myra', 'Rohit', 'Kavya', 'Sahil', 'Nisha', 'Manoj', 'Pooja', 'Yash', 'Sneha', 'Tarun', 'Divya', 'Harsh', 'Swati', 'Nikhil', 'Bhavna', 'Gaurav', 'Riya', 'Ajay', 'Lata', 'Pranav', 'Shreya', 'Irfan', 'Fatima', 'Joseph', 'Mary', 'Gurpreet', 'Harleen', 'Siddharth', 'Tanvi', 'Ravi', 'Asha'];
const LAST = ['Sharma', 'Verma', 'Iyer', 'Reddy', 'Patel', 'Nair', 'Das', 'Khan', 'Singh', 'Gupta', 'Joshi', 'Menon', 'Rao', 'Kulkarni', 'Mehta', 'Pillai', 'Chatterjee', 'Yadav', 'Thomas', 'Gill'];
const QUAL = { 1: '10th', 2: '12th', 3: 'ITI', 4: 'Diploma', 5: 'B.Com', 6: 'MBA' };
const QUAL_BY_SECTOR = { 'IT & Software': 'B.Tech', 'Design & Media': 'B.Des', Healthcare: 'B.Sc', Education: 'B.A.', 'Banking & Finance': 'B.Com', 'Human Resources': 'BBA', Marketing: 'BBA', Construction: 'Diploma', Manufacturing: 'Diploma' };
function rng(seed) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

const HASHES = new Map(); // demo accounts share passwords, so hash each one once (keeps cold starts fast)
function user(role, name, email, phone, password, extra = {}) {
  const p = `+91${phone}`;
  if (!HASHES.has(password)) HASHES.set(password, bcrypt.hashSync(password, 8));
  const r = run(`INSERT INTO users(role,name,email,phone_hash,phone_enc,phone_masked,password_hash,status,phone_verified,mfa_enabled) VALUES(?,?,?,?,?,?,?,?,1,?)`,
    role, name, email, hmac(p), encrypt(p), maskPhone(p), HASHES.get(password), extra.status || 'active', extra.mfa ? 1 : 0);
  run('INSERT INTO notification_prefs(user_id) VALUES(?)', r.lastInsertRowid);
  return Number(r.lastInsertRowid);
}

function seed() {
  const tx = db.transaction(() => {
    for (const [n, c, s] of SKILLS) run('INSERT OR IGNORE INTO skills(name,category,synonyms) VALUES(?,?,?)', n, c, JSON.stringify(s));
    for (const s of SECTORS) run('INSERT OR IGNORE INTO sectors(name) VALUES(?)', s);
    const sid = (n) => one('SELECT id FROM skills WHERE name=?', n).id;
    [['Software Developer', '2512.0100', 'IT & Software', ['JavaScript', 'SQL']], ['Electrician', '7411.0100', 'Manufacturing', ['Electrical Wiring']], ['Accountant', '2411.0100', 'Banking & Finance', ['Accounting', 'Tally ERP']], ['Staff Nurse', '2221.0100', 'Healthcare', ['Nursing']]]
      .forEach(([t, nco, sec, sk]) => run('INSERT INTO occupations(title,nco_code,sector,skill_ids) VALUES(?,?,?,?)', t, nco, sec, JSON.stringify(sk.map(sid))));
    [['Full Stack Web Development', 'Skill India Digital', ['React', 'Node.js', 'JavaScript']], ['Tally Prime with GST', 'NSDC Partner', ['Tally ERP', 'GST Filing']], ['Data Analytics with Python', 'NPTEL', ['Python', 'Data Analysis', 'SQL']],
      ['Industrial Safety (PMKVY)', 'PMKVY', ['Safety Compliance']], ['Digital Marketing Fundamentals', 'Skill India Digital', ['Digital Marketing', 'SEO', 'Social Media']], ['AWS Cloud Practitioner', 'AWS Skill Builder', ['Cloud (AWS)']]]
      .forEach(([t, p, sk]) => run('INSERT INTO trainings(title,provider,duration,skill_ids,url) VALUES(?,?,?,?,?)', t, p, '4-8 weeks', JSON.stringify(sk.map(sid)), 'https://www.skillindiadigital.gov.in'));

    user('admin', 'Platform Admin', 'admin@skillsetu.in', '9000000001', 'Admin@123', { mfa: true });

    const companyIds = COMPANIES.map(([name, ind, city, st, pan], i) => {
      const c = run(`INSERT INTO companies(name,slug,gstin,industry,size,city,state,about,website,verification_status,verified_at) VALUES(?,?,?,?,?,?,?,?,?,'verified',datetime('now'))`,
        name, name.toLowerCase().replace(/[^a-z0-9]+/g, '-'), gov.makeGstin(st, pan), ind, ['51-200', '201-1000', '1000+'][i % 3], city, require('../services/taxonomy').stateOf(city),
        `${name} is a ${ind} employer hiring across India.`, `https://${name.split(' ')[0].toLowerCase()}.example.in`);
      const uid = user('employer', ['Anita Rao', 'Karthik Subramanian', 'Neha Joshi', 'Rohan Mehta', 'Farah Siddiqui', 'Amit Bansal', 'Sanjay Reddy', 'Pooja Kulkarni', 'Arvind Iyer', 'Meera Rathore', 'Shalini Mishra', 'Deepak Nair', 'Harish Patel', 'Kavya Sharma', 'Suresh Gowda', 'Ritu Banerjee', 'Varun Khanna', 'Ankita Jain', 'Bikash Mohanty', 'Rupali Saikia', 'Thomas Mathew', 'Jignesh Shah', 'Lakshmi Prasad', 'Gurmeet Kaur', 'Rakesh Sinha', 'Sravani Rao', 'Prakash Deshmukh', 'Nikita Desai', 'Alok Tiwari', 'Sunita Arora'][i], i === 0 ? 'hr@finlytics.in' : `hr${i}@${name.split(' ')[0].toLowerCase()}.in`, `90000001${String(i).padStart(2, '0')}`.slice(0, 10), 'Employer@123');
      run("INSERT INTO employer_users(user_id,company_id,company_role) VALUES(?,?,'owner')", uid, c.lastInsertRowid);
      return { id: Number(c.lastInsertRowid), uid, city };
    });

    const deadline = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const jobIds = JOBS.map(([ci, title, desc, req, nice, wf, cmin, cmax, emin, edu, ct], k) => {
      const c = companyIds[ci]; const city = c.city;
      const daysAgo = (k * 3) % 50;
      const j = run(`INSERT INTO jobs(company_id,posted_by,title,description,sector,contract_type,work_format,city,state,ctc_min,ctc_max,experience_min,education_level,openings,deadline,status,published_at,created_at)
                     VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',datetime('now', ?),datetime('now', ?))`, c.id, c.uid, title, desc, COMPANIES[ci][1], ct || 'full_time', wf, city, require('../services/taxonomy').stateOf(city), cmin, cmax, emin, edu, 1 + (k % 5), deadline, `-${daysAgo} days`, `-${daysAgo} days`);
      const jid = Number(j.lastInsertRowid);
      req.forEach((s) => run('INSERT INTO job_skills(job_id,skill_id,required) VALUES(?,?,1)', jid, sid(s)));
      nice.forEach((s) => run('INSERT INTO job_skills(job_id,skill_id,required) VALUES(?,?,0)', jid, sid(s)));
      run("INSERT INTO job_status_history(job_id,from_status,to_status,actor_id,reason) VALUES(?,NULL,'active',?,'Published')", jid, c.uid);
      return jid;
    });

    const seekerIds = SEEKERS.map(([name, email, phone, city, edu, exp, skills, headline, ctc, qual, year], i) => {
      const uid = user('seeker', name, email, phone, 'Seeker@123');
      run(`INSERT INTO seeker_profiles(user_id,slug,headline,about,city,state,education_level,experience_years,expected_ctc_min,preferred_locations,languages,visibility,profile_level)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,2)`, uid, name.toLowerCase().replace(/\s+/g, '-'), headline, `${headline} based in ${city}.`, city, require('../services/taxonomy').stateOf(city), edu, exp, ctc, JSON.stringify([city]), JSON.stringify(['English', 'Hindi']), i === 3 ? 'public' : 'employers');
      skills.forEach((s) => run("INSERT INTO seeker_skills(user_id,skill_id,level) VALUES(?,?,'intermediate')", uid, sid(s)));
      run('INSERT INTO educations(user_id,qualification,level,institution,year) VALUES(?,?,?,?,?)', uid, qual, edu, `${city} Institute`, year);
      return uid;
    });

    // applications across pipeline stages + behaviour events for collaborative filtering
    const statuses = ['applied', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'];
    const pairs = [[0, 0], [0, 2], [1, 1], [1, 14], [2, 4], [2, 3], [3, 12], [4, 9], [5, 8], [6, 10], [7, 6], [3, 7], [0, 14], [5, 11]];
    pairs.forEach(([s, j], i) => {
      const st = statuses[i % statuses.length];
      const a = run(`INSERT INTO applications(job_id,seeker_id,status,match_score,created_at) VALUES(?,?,?,?,datetime('now', ?))`, jobIds[j], seekerIds[s], st, 55 + ((i * 7) % 40), `-${i * 4} days`);
      run('INSERT INTO application_events(application_id,status,note) VALUES(?,?,?)', a.lastInsertRowid, 'applied', 'Application submitted');
      if (st !== 'applied') run('INSERT INTO application_events(application_id,status,note) VALUES(?,?,?)', a.lastInsertRowid, st, null);
      run("INSERT INTO activity_events(user_id,role,event,job_id,created_at) VALUES(?, 'seeker', 'view_job', ?, datetime('now', ?))", seekerIds[s], jobIds[j], `-${i} days`);
    });
    for (let d = 0; d < 14; d++) for (let k = 0; k < 6 + (d % 4); k++) run("INSERT INTO activity_events(guest_id,event,meta,created_at) VALUES(?, 'search', ?, datetime('now', ?))", `g${k}`, JSON.stringify({ q: ['react', 'electrician', 'accounts', 'nurse', 'delivery', 'sales'][k % 6] }), `-${d} days`);
    run("INSERT INTO saved_jobs(user_id,job_id) VALUES(?,?)", seekerIds[0], jobIds[1]);
    // portals
    const pu = user('portal', 'Naukri Integration Team', 'api@naukri-demo.in', '9000000201', 'Portal@123');
    run("INSERT INTO portals(name,slug,owner_user_id,adapter,rate_limit_per_min,status) VALUES('Naukri (demo feed)','naukri-demo',?,'naukri',120,'active')", pu);
    run("INSERT INTO portals(name,slug,adapter,status) VALUES('National Career Service','ncs','ncs','active')");

    // content
    [['PMKVY 4.0 opens free skilling seats for 2026-27', 'Training', ['Safety Compliance', 'Electrical Wiring'], 'Pradhan Mantri Kaushal Vikas Yojana has opened fresh batches for short-term training in electrical, welding and logistics trades. Register through Skill India Digital.'],
     ['Tech hiring picks up in Bengaluru and Hyderabad', 'Market', ['React', 'Node.js', 'Karnataka'], 'Employers on SkillSetu posted more software roles this quarter, with React and Node.js the most requested skills.'],
     ['How to verify your certificates with DigiLocker', 'Guide', [], 'Link DigiLocker from your profile to fetch board and university certificates. Verified profiles rank higher with employers.']]
      .forEach(([t, cat, tags, body], i) => run(`INSERT INTO news(title,slug,summary,body,category,tags,status,published_at) VALUES(?,?,?,?,?,?,'published',datetime('now', ?))`, t, t.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60), body.slice(0, 120), body, cat, JSON.stringify(tags), `-${i * 5} days`));
    [['How does the match percentage work?', 'We compare your skills, education, experience, location and expected salary with each job. Administrators set the weight of each factor. The breakdown on every job shows what helped and what is missing.', 'Using SkillSetu', 'jobs,job'],
     ['Is my Aadhaar number stored?', 'Your Aadhaar is encrypted with AES-256 and only the last four digits are ever shown. You can delete your account and data at any time from Settings, as required by the DPDP Act, 2023.', 'Privacy', 'profile'],
     ['What is the minimum wage in my state?', 'Minimum wages are notified by each state government and revised twice a year (variable dearness allowance). Check your state labour department website or the Shram Suvidha portal for current rates.', 'Labour laws', ''],
     ['What does the Code on Wages, 2019 cover?', 'The Code on Wages consolidates laws on minimum wages, payment of wages, bonus and equal remuneration. It applies to all employees and requires timely payment of wages.', 'Labour laws', ''],
     ['How do employers get the Verified badge?', 'Employers enter their GSTIN (and optionally CIN). SkillSetu checks them against GSTN and MCA records automatically; if those systems are unreachable, an administrator reviews the documents manually.', 'Employers', 'company'],
     ['Can I hide my profile from employers?', 'Yes. In your profile choose Private. Private profiles never appear in employer searches or recommendations.', 'Privacy', 'profile'],
     ['How do I connect my job portal?', 'Register as a Job Portal, wait for approval, create an API key and push jobs to /api/v1/portal/jobs. Full API docs are at /api/docs.', 'Integrations', 'portal']]
      .forEach(([q, a, c, ctx]) => run('INSERT INTO faqs(question,answer,category,context) VALUES(?,?,?,?)', q, a, c, ctx || null));

    // ---------- Generated volume (runs after portals so some jobs can be portal-sourced) ----------
    const R = rng(42);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const tax = require('../services/taxonomy');
    const CITY_LIST = Object.keys(tax.CITIES);
    const portalRows = PORTALS_FOR_JOBS.map((slug) => one('SELECT id, slug, name FROM portals WHERE slug=?', slug)).filter(Boolean);
    const bySector = (sec) => companyIds.filter((_, i) => COMPANIES[i][1] === sec);
    const genJobs = [];
    const roleIdx = new Map(ROLES.map((r, i) => [r[0], i]));
    CITY_LIST.forEach((city, ci) => {
      const roles = ROLES.map((r, ri) => ri).filter((ri) => CORE_ROLES.includes(ROLES[ri][0]) || ROLES[ri][0] === HIGH_PAY_ROLES[ci % HIGH_PAY_ROLES.length] || (ri + ci) % 3 === 0);
      for (const ri of roles) {
        const [title, sector, req, nice, edu, emin, cmin, cmax, ct0, wf0] = ROLES[ri];
        const pool = bySector(sector).length ? bySector(sector) : companyIds;
        const c = pool[(ci + ri) % pool.length];
        const company = COMPANIES[companyIds.indexOf(c)][0];
        // Vary type, format, pay, experience and freshness so every filter has hits in every city.
        let ct = ct0; const roll = HIGH_PAY_ROLES.includes(title) ? 1 : R();
        if (roll < 0.1 && edu >= 4) ct = 'internship'; else if (roll < 0.18) ct = 'part_time'; else if (roll < 0.24) ct = 'contract';
        let wf = wf0; const w = R();
        if (sector === 'IT & Software' || sector === 'Marketing' || sector === 'Design & Media') wf = w < 0.3 ? 'remote' : w < 0.65 ? 'hybrid' : 'onsite';
        else if (w < 0.08 && ['Data Entry Operator', 'Telecaller', 'Customer Support Executive', 'Content Writer', 'Online Tutor'].includes(title)) wf = 'remote';
        else if (w < 0.15) wf = 'hybrid';
        const metro = ['Bengaluru', 'Mumbai', 'Delhi', 'Gurugram', 'Hyderabad', 'Pune', 'Chennai', 'Noida'].includes(city);
        const pay = (metro ? 1.15 : 0.95) * (0.9 + R() * 0.25) * (ct === 'internship' ? 0.45 : ct === 'part_time' ? 0.6 : 1);
        const exp = ct === 'internship' ? 0 : Math.max(0, emin + (R() < 0.25 ? -1 : R() < 0.2 ? 1 : 0));
        const daysAgo = R() < 0.1 ? 0 : R() < 0.35 ? Math.floor(R() * 7) : Math.floor(R() * 40);
        const fromPortal = R() < 0.15 && portalRows.length ? portalRows[(ci + ri) % portalRows.length] : null;
        const jt = ct === 'internship' && !/intern/i.test(title) ? `${title} Intern` : title;
        const desc = `${company} is hiring a ${jt} in ${city}. You will work with a friendly team, get on-the-job training and grow with us. Required: ${req.join(', ')}.${nice.length ? ` Good to have: ${nice.join(', ')}.` : ''} ${exp ? `${exp}+ years of experience preferred.` : 'Freshers are welcome to apply.'}`;
        const j = run(`INSERT INTO jobs(company_id,posted_by,portal_id,external_id,source,external_company,title,description,sector,contract_type,work_format,city,state,ctc_min,ctc_max,experience_min,education_level,openings,deadline,status,published_at,created_at)
                       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'active',datetime('now', ?),datetime('now', ?))`,
          fromPortal ? null : c.id, fromPortal ? null : c.uid, fromPortal?.id || null, fromPortal ? `${fromPortal.slug.toUpperCase()}-${ci}-${ri}` : null, fromPortal ? `portal:${fromPortal.slug}` : 'direct', fromPortal ? company : null,
          jt, desc, sector, ct, wf, city, tax.stateOf(city), Math.round((cmin * pay) / 1000) * 1000, Math.round((cmax * pay) / 1000) * 1000, exp, edu, 1 + Math.floor(R() * 10), deadline, `-${daysAgo} days`, `-${daysAgo} days`);
        const jid = Number(j.lastInsertRowid);
        req.forEach((x) => run('INSERT OR IGNORE INTO job_skills(job_id,skill_id,required) VALUES(?,?,1)', jid, sid(x)));
        nice.forEach((x) => run('INSERT OR IGNORE INTO job_skills(job_id,skill_id,required) VALUES(?,?,0)', jid, sid(x)));
        run("INSERT INTO job_status_history(job_id,from_status,to_status,actor_id,reason) VALUES(?,NULL,'active',?,?)", jid, fromPortal ? null : c.uid, fromPortal ? `Synced from ${fromPortal.name}` : 'Published');
        genJobs.push({ id: jid, role: ri, city });
      }
    });


    // Coverage pass: guarantee every city has at least one job for each filter value.
    const NEED = [
      ['contract_type', 'internship'], ['contract_type', 'contract'], ['contract_type', 'part_time'],
      ['work_format', 'remote'], ['work_format', 'hybrid'],
    ];
    for (const city of CITY_LIST) {
      const used = new Set();
      for (const [col, val] of NEED) {
        if (one(`SELECT 1 FROM jobs WHERE city=? AND ${col}=?`, city, val)) continue;
        const cand = db.prepare(`SELECT id, title, ctc_min, ctc_max FROM jobs WHERE city=? AND contract_type='full_time' AND work_format='onsite' ORDER BY id`).all(city).find((x) => !used.has(x.id) && (x.ctc_max || 0) < 1000000
          && (val !== 'remote' || /Support|Data Entry|Telecaller|Developer|Writer|Analyst|Tutor/.test(x.title)));
        if (!cand) continue; used.add(cand.id);
        if (val === 'internship') run("UPDATE jobs SET contract_type='internship', title=title || ' Intern', experience_min=0, ctc_min=ROUND(ctc_min*0.5,-3), ctc_max=ROUND(ctc_max*0.5,-3) WHERE id=?", cand.id);
        else if (val === 'part_time') run("UPDATE jobs SET contract_type='part_time', ctc_min=ROUND(ctc_min*0.6,-3), ctc_max=ROUND(ctc_max*0.6,-3) WHERE id=?", cand.id);
        else run(`UPDATE jobs SET ${col}=? WHERE id=?`, val, cand.id);
      }
      if (!one("SELECT 1 FROM jobs WHERE city=? AND published_at >= datetime('now','-1 day')", city)) run("UPDATE jobs SET published_at=datetime('now','-2 hours'), created_at=datetime('now','-2 hours') WHERE id=(SELECT id FROM jobs WHERE city=? ORDER BY id DESC LIMIT 1)", city);
      if (portalRows.length && !one("SELECT 1 FROM jobs WHERE city=? AND source<>'direct'", city)) {
        const p = portalRows[CITY_LIST.indexOf(city) % portalRows.length];
        const j = one("SELECT id, company_id FROM jobs WHERE city=? AND source='direct' AND id > ? ORDER BY id LIMIT 1", city, 15);
        if (j) run("UPDATE jobs SET portal_id=?, source=?, external_id=?, external_company=(SELECT name FROM companies WHERE id=?), company_id=NULL, posted_by=NULL WHERE id=?", p.id, `portal:${p.slug}`, `${p.slug.toUpperCase()}-FILL-${j.id}`, j.company_id, j.id);
      }
    }

    // Generated candidates: each is built around a role, living in a city where that role is hiring.
    const genSeekers = [];
    for (let n = 0; n < 240; n++) {
      const ri = n % ROLES.length; const [title, sector, req, nice, edu, emin, cmin] = ROLES[ri];
      const name = `${FIRST[(n * 3) % FIRST.length]} ${LAST[(n * 7 + Math.floor(n / FIRST.length)) % LAST.length]}`;
      const email = `${name.toLowerCase().replace(/\s+/g, '.')}${n}@example.in`;
      const phone = `9${String(700000000 + n * 1337).padStart(9, '0')}`;
      const uid = user('seeker', name, email, phone, 'Seeker@123');
      const jobsForRole = genJobs.filter((g) => g.role === ri);
      const homeCity = jobsForRole.length ? jobsForRole[(n * 5) % jobsForRole.length].city : pick(CITY_LIST);
      const exp = Math.max(0, emin + Math.floor(R() * 3) - (R() < 0.3 ? 1 : 0));
      const skills = [...new Set([...req.filter(() => R() > 0.12), ...nice.filter(() => R() > 0.45), ...(R() > 0.5 ? ['Communication'] : []), ...(R() > 0.4 ? ['English'] : [])])];
      if (!skills.length) skills.push(req[0]);
      const prefs = R() < 0.35 ? [homeCity, 'Anywhere'] : [homeCity];
      const vis = R() < 0.25 ? 'public' : R() < 0.05 ? 'private' : 'employers';
      const eduLevel = Math.max(1, edu + (R() < 0.2 ? 1 : 0) - (R() < 0.12 ? 1 : 0));
      run(`INSERT INTO seeker_profiles(user_id,slug,headline,about,city,state,education_level,experience_years,expected_ctc_min,preferred_locations,languages,visibility,profile_level,ekyc_verified,digilocker_verified)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,2,?,?)`, uid, `${name.toLowerCase().replace(/\s+/g, '-')}-${uid}`, exp ? `${title} with ${exp} yrs experience` : `Aspiring ${title}`,
        `${exp ? `${exp} years` : 'Fresher'} looking for ${title.toLowerCase()} roles in ${homeCity}.`, homeCity, tax.stateOf(homeCity), eduLevel, exp, Math.round(cmin * (0.85 + R() * 0.25)),
        JSON.stringify(prefs), JSON.stringify(['English', 'Hindi'].slice(0, 1 + (n % 2))), vis, R() < 0.4 ? 1 : 0, R() < 0.5 ? 1 : 0);
      skills.forEach((x) => run('INSERT OR IGNORE INTO seeker_skills(user_id,skill_id,level) VALUES(?,?,?)', uid, sid(x), pick(['beginner', 'intermediate', 'intermediate', 'expert'])));
      run('INSERT INTO educations(user_id,qualification,level,institution,year,verified) VALUES(?,?,?,?,?,?)', uid, eduLevel >= 5 ? (QUAL_BY_SECTOR[sector] || QUAL[5]) : QUAL[eduLevel] || '12th', eduLevel, `${homeCity} ${eduLevel >= 5 ? 'College' : 'Institute'}`, 2025 - exp - (eduLevel >= 5 ? 0 : 1), R() < 0.5 ? 1 : 0);
      if (exp) run('INSERT INTO experiences(user_id,title,company,start_date,current) VALUES(?,?,?,?,1)', uid, title, `${pick(LAST)} Enterprises`, `${2026 - exp}-06-01`);
      genSeekers.push({ uid, role: ri, city: homeCity });
    }

    // Applications and behaviour so dashboards, funnels and collaborative filtering have signal.
    const stages = ['applied', 'applied', 'shortlisted', 'interview', 'offered', 'hired', 'rejected'];
    genSeekers.forEach((s, i) => {
      const mine = genJobs.filter((g) => g.role === s.role).sort((a, b) => (b.city === s.city) - (a.city === s.city));
      const n = 1 + (i % 3);
      for (let k = 0; k < Math.min(n, mine.length); k++) {
        const st = stages[(i + k) % stages.length];
        const a = run(`INSERT OR IGNORE INTO applications(job_id,seeker_id,status,match_score,created_at) VALUES(?,?,?,?,datetime('now', ?))`, mine[k].id, s.uid, st, 0, `-${Math.floor(R() * 90)} days`);
        if (a.changes) {
          run("INSERT INTO application_events(application_id,status,note) VALUES(?, 'applied', 'Application submitted')", a.lastInsertRowid);
          if (st !== 'applied') run('INSERT INTO application_events(application_id,status,note) VALUES(?,?,NULL)', a.lastInsertRowid, st);
        }
      }
      for (const g of mine.slice(0, 6)) run("INSERT INTO activity_events(user_id,role,event,job_id,created_at) VALUES(?, 'seeker', 'view_job', ?, datetime('now', ?))", s.uid, g.id, `-${Math.floor(R() * 20)} days`);
      run("INSERT INTO activity_events(user_id,role,event,job_id) VALUES(?, 'seeker', 'view_job', ?)", s.uid, pick(genJobs).id);
      if (R() < 0.5 && mine.length) run('INSERT OR IGNORE INTO saved_jobs(user_id,job_id) VALUES(?,?)', s.uid, mine[mine.length - 1].id);
    });
  });
  tx();
  // Score every seeded application with the real matching engine so analytics reflect the AI.
  const taxonomy = require('../services/taxonomy'); taxonomy.invalidate();
  const engine = require('../services/matching/engine'); engine.invalidate();
  const jobsById = new Map(engine.loadJobs("j.status='active'").map((j) => [j.id, j]));
  const upd = db.prepare('UPDATE applications SET match_score=? WHERE id=?');
  const seekers = new Map();
  db.transaction(() => {
    for (const a of db.prepare('SELECT id, job_id, seeker_id FROM applications').all()) {
      const j = jobsById.get(a.job_id); if (!j) continue;
      if (!seekers.has(a.seeker_id)) seekers.set(a.seeker_id, engine.loadSeeker(a.seeker_id));
      upd.run(engine.scorePair(seekers.get(a.seeker_id), j).score, a.id);
    }
  })();
  require('../services/audit').append({ action: 'system.seed', entity: 'system' });
  console.log('Seeded demo data. Logins: admin@skillsetu.in/Admin@123, hr@finlytics.in/Employer@123, priya@example.in/Seeker@123, api@naukri-demo.in/Portal@123');
}

if (require.main === module) {
  if (process.argv.includes('--reset')) {
    const fs = require('fs'); const cfg = require('../config');
    db.close(); for (const f of [cfg.dbFile, `${cfg.dbFile}-wal`, `${cfg.dbFile}-shm`]) try { fs.unlinkSync(f); } catch { /* none */ }
    console.log('Database removed. Start the server to re-seed.');
  } else if (one("SELECT 1 FROM users WHERE role='admin'")) console.log('Already seeded. Use npm run reset to start over.');
  else seed();
}
module.exports = { seed };
