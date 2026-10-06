import express from 'express';
import { randomUUID } from 'node:crypto';

const applicationStatuses = ['Applied', 'Reviewing', 'Shortlisted', 'Interview', 'Accepted', 'Rejected'];
const experienceLevels = ['Any', 'Entry', 'Intermediate', 'Senior', 'Lead'];
const employmentTypes = ['Full-time', 'Part-time', 'Contract', 'Freelance', 'Internship', 'Temporary'];
const workModes = ['Remote', 'On-site', 'Hybrid'];
const profileTextFields = [
  'headline', 'bio', 'location', 'country', 'experienceLevel', 'githubUrl',
  'linkedinUrl', 'websiteUrl', 'availability', 'workPreference',
];
const profileArrayFields = ['skills', 'languages', 'frameworks', 'tools'];
const profileObjectFields = {
  education: ['institution', 'qualification', 'fieldOfStudy', 'startDate', 'endDate', 'description'],
  certifications: ['name', 'issuer', 'issuedAt', 'credentialUrl'],
  projects: ['name', 'description', 'url', 'role'],
};
const jobTextFields = ['title', 'organization', 'description', 'experienceLevel', 'employmentType', 'workMode', 'location', 'deadline', 'additionalRequirements'];

function ensurePlatformCollections(db) {
  db.connections ||= [];
  db.connections = db.connections.map((connection) => ({
    ...connection,
    id: connection.id || randomUUID(),
    requesterId: connection.requesterId || connection.followerId,
    recipientId: connection.recipientId || connection.followingId,
    status: ['pending', 'accepted', 'rejected'].includes(connection.status) ? connection.status : 'pending',
    createdAt: connection.createdAt || new Date().toISOString(),
  }));
  db.jobs ||= [];
  db.applications ||= [];
}

function safePublicUser(user, publicUser) {
  const basic = publicUser(user);
  return {
    ...basic,
    headline: user.profile?.headline || '',
    location: user.profile?.location || '',
    country: user.profile?.country || '',
    experienceLevel: user.profile?.experienceLevel || '',
    yearsExperience: user.profile?.yearsExperience ?? null,
    availability: user.profile?.availability || '',
    workPreference: user.profile?.workPreference || '',
    languages: user.profile?.languages || [],
    frameworks: user.profile?.frameworks || [],
    tools: user.profile?.tools || [],
    education: user.profile?.education || [],
    certifications: user.profile?.certifications || [],
    projects: user.profile?.projects || [],
    githubUrl: user.profile?.githubUrl || '',
    linkedinUrl: user.profile?.linkedinUrl || '',
    websiteUrl: user.profile?.websiteUrl || '',
  };
}

function toPublicJob(job, db, publicUser) {
  const owner = db.users.find((user) => user.id === job.ownerId);
  return {
    id: job.id,
    title: job.title,
    organization: job.organization,
    description: job.description,
    requiredSkills: job.requiredSkills,
    experienceLevel: job.experienceLevel,
    employmentType: job.employmentType,
    workMode: job.workMode,
    location: job.location,
    salary: job.salary,
    deadline: job.deadline,
    additionalRequirements: job.additionalRequirements,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    hirer: owner ? safePublicUser(owner, publicUser) : null,
  };
}

function boundedText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeStringList(value, maxItems = 50, maxLength = 100) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) return null;
  return [...new Set(value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxLength))
    .filter(Boolean))].slice(0, maxItems);
}

function normalizeObjectList(value, fields) {
  if (!Array.isArray(value)) return null;
  const normalized = [];
  for (const item of value.slice(0, 30)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
    const result = {};
    for (const field of fields) {
      if (item[field] !== undefined && typeof item[field] !== 'string') return null;
      result[field] = boundedText(item[field] || '', field === 'description' ? 3000 : 500);
    }
    if (item.technologies !== undefined) {
      const technologies = normalizeStringList(item.technologies, 30, 80);
      if (!technologies) return null;
      result.technologies = technologies;
    }
    normalized.push(result);
  }
  return normalized;
}

function safeExternalUrl(value) {
  const url = boundedText(value, 1000);
  if (!url) return '';
  try {
    const parsed = new URL(url);
    if ((parsed.protocol !== 'https:' && parsed.protocol !== 'http:') || parsed.username || parsed.password) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function deadlineHasPassed(value) {
  if (!value) return false;
  const timestamp = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T23:59:59.999Z`)
    : Date.parse(value);
  return Number.isFinite(timestamp) && timestamp < Date.now();
}

function profileInput(body, current = {}) {
  const profile = { ...current };
  for (const key of profileTextFields) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') return { error: `${key} must be text` };
      profile[key] = boundedText(body[key], key === 'bio' ? 3000 : 300);
    }
  }
  for (const key of profileArrayFields) {
    if (body[key] !== undefined) {
      const values = normalizeStringList(body[key], 50, 150);
      if (!values) return { error: `${key} must be a list of text values` };
      profile[key] = values;
    }
  }
  for (const [key, fields] of Object.entries(profileObjectFields)) {
    if (body[key] !== undefined) {
      const values = normalizeObjectList(body[key], fields);
      if (!values) return { error: `${key} must be a list of valid profile records` };
      profile[key] = values;
    }
  }
  if (body.yearsExperience === null || body.yearsExperience === '') {
    profile.yearsExperience = null;
  } else if (body.yearsExperience !== undefined) {
    const years = Number(body.yearsExperience);
    if (!Number.isInteger(years) || years < 0 || years > 80) return { error: 'yearsExperience must be a whole number from 0 to 80' };
    profile.yearsExperience = years;
  }
  return { profile };
}

function jobInput(body, current = {}) {
  const job = { ...current };
  for (const key of jobTextFields) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== 'string') return { error: `${key} must be text` };
      job[key] = boundedText(body[key], key === 'description' || key === 'additionalRequirements' ? 12000 : 300);
    }
  }
  if (body.requiredSkills !== undefined) {
    const values = normalizeStringList(body.requiredSkills, 50, 100);
    if (!values) return { error: 'requiredSkills must be a list of text values' };
    job.requiredSkills = values;
  }
  if (body.salary !== undefined) {
    const salary = body.salary;
    if (!salary || typeof salary !== 'object' || Array.isArray(salary)) return { error: 'salary must be an object' };
    const min = salary.min === '' || salary.min == null ? null : Number(salary.min);
    const max = salary.max === '' || salary.max == null ? null : Number(salary.max);
    const currency = boundedText(salary.currency || '', 3).toUpperCase();
    const period = boundedText(salary.period || '', 30);
    if ((min !== null && (!Number.isFinite(min) || min < 0)) ||
        (max !== null && (!Number.isFinite(max) || max < 0)) ||
        (min !== null && max !== null && min > max)) {
      return { error: 'Salary range must contain valid non-negative amounts with minimum no greater than maximum' };
    }
    if (currency && !/^[A-Z]{3}$/.test(currency)) return { error: 'Currency must be a three-letter currency code' };
    job.salary = { min, max, currency, period };
  }
  if (job.title && !job.organization) return { error: 'Company or organization is required' };
  if (job.deadline && Number.isNaN(Date.parse(job.deadline))) return { error: 'Application deadline is invalid' };
  for (const [field, choices] of [
    ['experienceLevel', experienceLevels.slice(1)],
    ['employmentType', employmentTypes],
    ['workMode', workModes],
  ]) {
    if (job[field] && !choices.includes(job[field])) return { error: `${field} is not supported` };
  }
  return { job };
}

export function createPlatformRouter({ auth, load, save, publicUser, notifyUser }) {
  const router = express.Router();
  const asyncRoute = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);

  router.get('/developers', (req, res) => {
    const db = load();
    const search = boundedText(req.query.search, 120).toLowerCase();
    const skill = boundedText(req.query.skill, 100).toLowerCase();
    const technology = boundedText(req.query.technology, 100).toLowerCase();
    const experience = boundedText(req.query.experience, 80).toLowerCase();
    const location = boundedText(req.query.location, 120).toLowerCase();
    const availability = boundedText(req.query.availability, 80).toLowerCase();
    const developers = db.users.filter((user) => {
      if (user.status !== 'active' || user.accountType !== 'developer') return false;
      const profile = user.profile || {};
      const searchable = [
        user.name, user.username, user.bio, profile.headline, profile.location, profile.country,
        ...(user.skills || []), ...(profile.languages || []), ...(profile.frameworks || []), ...(profile.tools || []),
      ].join(' ').toLowerCase();
      const technologies = [...(user.skills || []), ...(profile.languages || []), ...(profile.frameworks || []), ...(profile.tools || [])].join(' ').toLowerCase();
      return (!search || searchable.includes(search)) &&
        (!skill || (user.skills || []).some((value) => value.toLowerCase().includes(skill))) &&
        (!technology || technologies.includes(technology)) &&
        (!experience || (profile.experienceLevel || '').toLowerCase() === experience) &&
        (!location || `${profile.location || ''} ${profile.country || ''}`.toLowerCase().includes(location)) &&
        (!availability || (profile.availability || '').toLowerCase() === availability);
    }).slice(0, 100).map((user) => safePublicUser(user, publicUser));
    res.json(developers);
  });

  router.get('/developers/:id', (req, res) => {
    const db = load();
    const user = db.users.find((item) => item.id === req.params.id && item.status === 'active' && item.accountType === 'developer');
    if (!user) return res.status(404).json({ error: 'Developer profile not found' });
    res.json(safePublicUser(user, publicUser));
  });

  router.get('/profile', auth, (req, res) => {
    const user = load().users.find((item) => item.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ ...safePublicUser(user, publicUser), verificationRequestAt: user.verificationRequestAt || null, profile: user.profile || {} });
  });

  router.patch('/profile', auth, asyncRoute(async (req, res) => {
    const db = load();
    const user = db.users.find((item) => item.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.name !== undefined) {
      if (typeof req.body.name !== 'string' || !req.body.name.trim()) return res.status(400).json({ error: 'Name cannot be empty' });
      user.name = boundedText(req.body.name, 120);
    }
    if (req.body.username !== undefined) {
      const username = boundedText(req.body.username, 40).replace(/^@/, '');
      if (!/^[a-zA-Z0-9_.-]{3,40}$/.test(username)) return res.status(400).json({ error: 'Username must be 3–40 letters, numbers, dots, underscores, or hyphens' });
      if (db.users.some((item) => item.id !== user.id && item.username.toLowerCase() === username.toLowerCase())) {
        return res.status(409).json({ error: 'That username is already in use' });
      }
      user.username = username;
    }
    if (req.body.avatar !== undefined) {
      if (typeof req.body.avatar !== 'string') return res.status(400).json({ error: 'avatar must be text' });
      const avatar = safeExternalUrl(req.body.avatar);
      if (req.body.avatar && !avatar) return res.status(400).json({ error: 'Profile photo must use an http or https URL without embedded credentials' });
      user.avatar = avatar;
    }
    const parsed = profileInput(req.body, user.profile || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    for (const key of ['githubUrl', 'linkedinUrl', 'websiteUrl']) {
      if (parsed.profile[key]) {
        const url = safeExternalUrl(parsed.profile[key]);
        if (!url) return res.status(400).json({ error: `${key} must use an http or https URL` });
        parsed.profile[key] = url;
      }
    }
    for (const [field, entries] of [['projects', parsed.profile.projects || []], ['certifications', parsed.profile.certifications || []]]) {
      for (const entry of entries) {
        const key = field === 'projects' ? 'url' : 'credentialUrl';
        if (entry[key]) {
          const url = safeExternalUrl(entry[key]);
          if (!url) return res.status(400).json({ error: `${key} must use an http or https URL` });
          entry[key] = url;
        }
      }
    }
    user.profile = parsed.profile;
    user.bio = user.profile.bio || '';
    user.skills = user.profile.skills || [];
    ensurePlatformCollections(db);
    await save(db);
    res.json({ ...safePublicUser(user, publicUser), profile: user.profile });
  }));

  router.patch('/profile/preferences', auth, asyncRoute(async (req, res) => {
    const wallpaper = req.body?.chatWallpaper;
    const theme = req.body?.theme;
    const wallpaperImage = req.body?.chatWallpaperImage;
    const notificationSound = req.body?.notificationSound;
    if (wallpaper !== undefined && !['dark-grid', 'deep-space', 'circuit', 'aurora', 'light-grid', 'light-circuit', 'solid-white', 'solid-midnight', 'solid-slate', 'gradient-violet', 'gradient-ocean', 'custom'].includes(wallpaper)) {
      return res.status(400).json({ error: 'Choose a supported chat wallpaper' });
    }
    if (theme !== undefined && !['light', 'dark'].includes(theme)) return res.status(400).json({ error: 'Theme must be light or dark' });
    if (notificationSound !== undefined && typeof notificationSound !== 'boolean') return res.status(400).json({ error: 'notificationSound must be a boolean' });
    if (wallpaperImage !== undefined && (typeof wallpaperImage !== 'string' || (wallpaperImage && !/^\/uploads\/[a-zA-Z0-9._-]+$/.test(wallpaperImage)))) {
      return res.status(400).json({ error: 'Chat background must be a valid uploaded image path' });
    }
    if (wallpaper === undefined && theme === undefined && wallpaperImage === undefined && notificationSound === undefined) return res.status(400).json({ error: 'Provide a preference to update' });
    const db = load();
    const user = db.users.find((item) => item.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    user.preferences ||= {};
    if (wallpaper !== undefined) user.preferences.chatWallpaper = wallpaper;
    if (wallpaperImage !== undefined) user.preferences.chatWallpaperImage = wallpaperImage;
    if (theme !== undefined) user.preferences.theme = theme;
    if (notificationSound !== undefined) user.preferences.notificationSound = notificationSound;
    await save(db);
    res.json({
      chatWallpaper: user.preferences.chatWallpaper || 'dark-grid',
      chatWallpaperImage: user.preferences.chatWallpaperImage || '',
      theme: user.preferences.theme || 'dark',
      notificationSound: user.preferences.notificationSound ?? false,
    });
  }));

  router.get('/profile/preferences', auth, (req, res) => {
    const user = load().users.find((item) => item.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      chatWallpaper: user.preferences?.chatWallpaper || 'dark-grid',
      chatWallpaperImage: user.preferences?.chatWallpaperImage || '',
      theme: user.preferences?.theme || 'dark',
      notificationSound: user.preferences?.notificationSound ?? false,
    });
  });

  router.post('/profile/verification-request', auth, asyncRoute(async (req, res) => {
    const db = load();
    const user = db.users.find((item) => item.id === req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const profile = user.profile || {};
    const ready = Boolean(user.name?.trim() && user.username?.trim() && user.avatar &&
      profile.headline?.trim() && profile.bio?.trim() && (profile.location?.trim() || profile.country?.trim()) &&
      (user.skills || []).length >= 3 && profile.experienceLevel &&
      (profile.projects || []).some((project) => project.name?.trim() && project.description?.trim()));
    if (!ready) return res.status(400).json({ error: 'Complete your profile photo, headline, about section, location, three skills, experience level, and one described project before requesting verification.' });
    if (user.verified) return res.status(409).json({ error: 'Your profile is already verified' });
    if (user.verificationRequestAt) return res.status(409).json({ error: 'Your verification request is already awaiting review' });
    user.verificationRequestAt = new Date().toISOString();
    await save(db);
    res.status(202).json({ requested: true, requestedAt: user.verificationRequestAt });
  }));

  router.get('/connections', auth, (req, res) => {
    const db = load();
    ensurePlatformCollections(db);
    const connections = db.connections.flatMap((connection) => {
      const isRequester = connection.requesterId === req.user.id;
      const isRecipient = connection.recipientId === req.user.id;
      if (!isRequester && !isRecipient) return [];
      if (connection.status === 'rejected') return [];
      const otherId = isRequester ? connection.recipientId : connection.requesterId;
      const user = db.users.find((account) => account.id === otherId && account.status === 'active');
      if (!user) return [];
      return [{
        id: connection.id,
        user: safePublicUser(user, publicUser),
        status: connection.status,
        direction: connection.status === 'accepted' ? 'connected' : isRequester ? 'outgoing' : 'incoming',
      }];
    });
    res.json({ connections });
  });

  router.post('/connections/:userId', auth, asyncRoute(async (req, res) => {
    if (req.params.userId === req.user.id) return res.status(400).json({ error: 'You cannot follow your own profile' });
    const db = load();
    ensurePlatformCollections(db);
    const target = db.users.find((user) => user.id === req.params.userId && user.status === 'active' && user.accountType === 'developer');
    if (!target) return res.status(404).json({ error: 'Developer not found' });
    const existing = db.connections.find((connection) =>
      (connection.requesterId === req.user.id && connection.recipientId === target.id) ||
      (connection.requesterId === target.id && connection.recipientId === req.user.id));
    if (existing?.status === 'accepted') return res.json({ status: 'accepted' });
    if (existing?.status === 'pending') {
      if (existing.requesterId === req.user.id) return res.json({ status: 'pending' });
      return res.json({ status: 'incoming' });
    }
    if (existing) {
      existing.requesterId = req.user.id;
      existing.recipientId = target.id;
      existing.status = 'pending';
      existing.createdAt = new Date().toISOString();
    } else {
      db.connections.push({
        id: randomUUID(),
        requesterId: req.user.id,
        recipientId: target.id,
        status: 'pending',
        createdAt: new Date().toISOString(),
      });
    }
    await save(db);
    await notifyUser?.(target.id, 'connection_request', 'New connection request', `${db.users.find(user=>user.id===req.user.id)?.name||'A developer'} wants to connect with you.`, { userId: req.user.id, url: `/developers/${encodeURIComponent(req.user.id)}` });
    res.status(201).json({ status: 'pending' });
  }));

  router.patch('/connections/:userId', auth, asyncRoute(async (req, res) => {
    if (!['accepted', 'rejected'].includes(req.body?.status)) {
      return res.status(400).json({ error: 'Connection status must be accepted or rejected' });
    }
    const db = load();
    ensurePlatformCollections(db);
    const connection = db.connections.find((item) =>
      item.requesterId === req.params.userId &&
      item.recipientId === req.user.id &&
      item.status === 'pending');
    if (!connection) return res.status(404).json({ error: 'Pending connection request not found' });
    connection.status = req.body.status;
    connection.updatedAt = new Date().toISOString();
    await save(db);
    if(connection.status==='accepted')await notifyUser?.(connection.requesterId,'connection_accepted','Connection accepted',`${db.users.find(user=>user.id===req.user.id)?.name||'A developer'} accepted your connection request.`,{userId:req.user.id,url:`/developers/${encodeURIComponent(req.user.id)}`});
    res.json({ status: connection.status });
  }));

  router.delete('/connections/:userId', auth, asyncRoute(async (req, res) => {
    const db = load();
    ensurePlatformCollections(db);
    const connection = db.connections.find((item) =>
      (item.requesterId === req.user.id && item.recipientId === req.params.userId) ||
      (item.requesterId === req.params.userId && item.recipientId === req.user.id));
    if (!connection) return res.status(404).json({ error: 'Connection not found' });
    if (connection.status === 'pending' && connection.requesterId !== req.user.id) {
      return res.status(403).json({ error: 'Only the requester can cancel a pending connection' });
    }
    db.connections = db.connections.filter((item) => item.id !== connection.id);
    await save(db);
    res.json({ status: 'none' });
  }));

  router.get('/jobs', (req, res) => {
    const db = load();
    const search = boundedText(req.query.search, 120).toLowerCase();
    const skills = boundedText(req.query.skills, 120).toLowerCase();
    const experience = boundedText(req.query.experience, 80);
    const employmentType = boundedText(req.query.employmentType, 50);
    const workMode = boundedText(req.query.workMode, 50);
    const location = boundedText(req.query.location, 120).toLowerCase();
    const currency = boundedText(req.query.currency, 3).toUpperCase();
    const minSalary = req.query.minSalary === undefined ? null : Number(req.query.minSalary);
    const maxSalary = req.query.maxSalary === undefined ? null : Number(req.query.maxSalary);
    if ((minSalary !== null && (!Number.isFinite(minSalary) || minSalary < 0)) || (maxSalary !== null && (!Number.isFinite(maxSalary) || maxSalary < 0))) {
      return res.status(400).json({ error: 'Salary filters must be valid non-negative numbers' });
    }
    const jobs = (db.jobs || []).filter((job) => {
      if (job.status !== 'open') return false;
      const searchable = `${job.title} ${job.organization} ${job.description} ${job.requiredSkills.join(' ')}`.toLowerCase();
      return (!search || searchable.includes(search)) &&
        (!skills || job.requiredSkills.some((value) => value.toLowerCase().includes(skills))) &&
        (!experience || experience === 'Any' || job.experienceLevel === experience) &&
        (!employmentType || job.employmentType === employmentType) &&
        (!workMode || job.workMode === workMode) &&
        (!location || job.location.toLowerCase().includes(location)) &&
        (!currency || job.salary?.currency === currency) &&
        (minSalary === null || job.salary?.max == null || job.salary.max >= minSalary) &&
        (maxSalary === null || job.salary?.min == null || job.salary.min <= maxSalary);
    }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100);
    res.json(jobs.map((job) => toPublicJob(job, db, publicUser)));
  });

  router.get('/jobs/mine', auth, (req, res) => {
    const db = load();
    res.json((db.jobs || []).filter((job) => job.ownerId === req.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((job) => toPublicJob(job, db, publicUser)));
  });

  router.post('/jobs', auth, asyncRoute(async (req, res) => {
    const parsed = jobInput(req.body || {});
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    const job = parsed.job;
    if (!job.title || !job.organization || !job.description || !job.experienceLevel || !job.employmentType || !job.workMode) {
      return res.status(400).json({ error: 'Title, organization, description, experience, employment type, and work mode are required' });
    }
    if (job.deadline && Number.isNaN(Date.parse(job.deadline))) return res.status(400).json({ error: 'Application deadline is invalid' });
    if (!job.requiredSkills) job.requiredSkills = [];
    if (!job.location) job.location = '';
    if (!job.salary) job.salary = { min: null, max: null, currency: '', period: '' };
    if (!job.additionalRequirements) job.additionalRequirements = '';
    const db = load();
    ensurePlatformCollections(db);
    const now = new Date().toISOString();
    const created = { ...job, id: randomUUID(), ownerId: req.user.id, status: 'open', createdAt: now, updatedAt: now };
    db.jobs.push(created);
    await save(db);
    res.status(201).json(toPublicJob(created, db, publicUser));
  }));

  const optionalAuth = (req, res, next) => {
    if (!req.headers.authorization) return next();
    return auth(req, res, next);
  };

  router.get('/jobs/:id', optionalAuth, (req, res) => {
    const db = load();
    const job = (db.jobs || []).find((item) => item.id === req.params.id);
    if (!job || (job.status !== 'open' && job.ownerId !== req.user?.id)) return res.status(404).json({ error: 'Job not found' });
    res.json(toPublicJob(job, db, publicUser));
  });

  router.patch('/jobs/:id', auth, asyncRoute(async (req, res) => {
    const db = load();
    const job = (db.jobs || []).find((item) => item.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the job owner can manage this listing' });
    if (req.body.status !== undefined) {
      if (!['open', 'closed'].includes(req.body.status)) return res.status(400).json({ error: 'Job status must be open or closed' });
      job.status = req.body.status;
    }
    if (Object.keys(req.body).some((key) => key !== 'status')) {
      const parsed = jobInput(req.body, job);
      if (parsed.error) return res.status(400).json({ error: parsed.error });
      if (!parsed.job.title || !parsed.job.organization || !parsed.job.description) {
        return res.status(400).json({ error: 'Title, organization, and description cannot be empty' });
      }
      Object.assign(job, parsed.job);
    }
    job.updatedAt = new Date().toISOString();
    await save(db);
    res.json(toPublicJob(job, db, publicUser));
  }));

  router.post('/jobs/:id/applications', auth, asyncRoute(async (req, res) => {
    const db = load();
    ensurePlatformCollections(db);
    const job = db.jobs.find((item) => item.id === req.params.id && item.status === 'open');
    if (!job) return res.status(404).json({ error: 'Open job not found' });
    if (deadlineHasPassed(job.deadline)) return res.status(410).json({ error: 'The application deadline for this job has passed' });
    if (job.ownerId === req.user.id) return res.status(400).json({ error: 'You cannot apply to your own job' });
    if (db.applications.some((application) => application.jobId === job.id && application.applicantId === req.user.id)) {
      return res.status(409).json({ error: 'You have already applied to this job' });
    }
    const note = boundedText(req.body?.note || '', 3000);
    const application = {
      id: randomUUID(),
      jobId: job.id,
      applicantId: req.user.id,
      note,
      status: 'Applied',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.applications.push(application);
    await save(db);
    res.status(201).json({ ...application, job: toPublicJob(job, db, publicUser) });
  }));

  router.get('/applications/mine', auth, (req, res) => {
    const db = load();
    res.json((db.applications || []).filter((application) => application.applicantId === req.user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((application) => ({
        ...application,
        job: toPublicJob(db.jobs.find((job) => job.id === application.jobId) || {
          id: application.jobId, title: 'Unavailable job', organization: '', description: '', requiredSkills: [],
          salary: {}, status: 'closed', createdAt: application.createdAt,
        }, db, publicUser),
      })));
  });

  router.get('/jobs/:id/applications', auth, (req, res) => {
    const db = load();
    const job = (db.jobs || []).find((item) => item.id === req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the job owner can view applicants' });
    res.json((db.applications || []).filter((application) => application.jobId === job.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((application) => {
        const applicant = db.users.find((user) => user.id === application.applicantId);
        return { ...application, applicant: applicant ? safePublicUser(applicant, publicUser) : null };
      }));
  });

  router.patch('/applications/:id', auth, asyncRoute(async (req, res) => {
    const db = load();
    const application = (db.applications || []).find((item) => item.id === req.params.id);
    if (!application) return res.status(404).json({ error: 'Application not found' });
    const job = (db.jobs || []).find((item) => item.id === application.jobId);
    if (!job || job.ownerId !== req.user.id) return res.status(403).json({ error: 'Only the hirer can manage this application' });
    if (!applicationStatuses.includes(req.body.status)) return res.status(400).json({ error: 'Unsupported application status' });
    application.status = req.body.status;
    application.updatedAt = new Date().toISOString();
    await save(db);
    res.json(application);
  }));

  return router;
}
