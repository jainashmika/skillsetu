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
];
const SECTORS = ['IT & Software', 'Manufacturing', 'Logistics', 'Banking & Finance', 'Healthcare', 'Retail', 'Marketing', 'Construction', 'Education', 'Hospitality'];
const COMPANIES = [
  ['Finlytics Pvt Ltd', 'IT & Software', 'Bengaluru', '29', 'AAACF1234K'], ['Shakti Engineering Works', 'Manufacturing', 'Coimbatore', '33', 'AAFCS4321M'], ['Acme Logistics', 'Logistics', 'Pune', '27', 'AABCA7788P'],
  ['Sahyog Small Finance Bank', 'Banking & Finance', 'Mumbai', '27', 'AADCS5566Q'], ['Arogya Hospitals', 'Healthcare', 'Hyderabad', '36', 'AAECA9911R'], ['BrightCart Retail', 'Retail', 'Delhi', '07', 'AAGCB2233S'],
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

function user(role, name, email, phone, password, extra = {}) {
  const p = `+91${phone}`;
  const r = run(`INSERT INTO users(role,name,email,phone_hash,phone_enc,phone_masked,password_hash,status,phone_verified,mfa_enabled) VALUES(?,?,?,?,?,?,?,?,1,?)`,
    role, name, email, hmac(p), encrypt(p), maskPhone(p), bcrypt.hashSync(password, 8), extra.status || 'active', extra.mfa ? 1 : 0);
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
      const uid = user('employer', ['Anita Rao', 'Karthik Subramanian', 'Neha Joshi', 'Rohan Mehta', 'Farah Siddiqui', 'Amit Bansal'][i], i === 0 ? 'hr@finlytics.in' : `hr${i}@${name.split(' ')[0].toLowerCase()}.in`, `90000001${String(i).padStart(2, '0')}`, 'Employer@123');
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
  });
  tx();
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
