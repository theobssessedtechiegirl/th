'use strict';

/* =========================================================================
   1. APPLICATION STATE
   Single in-memory source of truth. Nothing reads/writes localStorage
   directly outside of loadData()/saveData() — every other function works
   against this object, then calls saveData() when it changes something.
   ========================================================================= */

const STORAGE_KEY = 'devtrack_data_v1';

const DEFAULT_STATE = {
  user: {
    name: 'New Developer',
    username: 'devuser',
    bio: 'Tell the world what you build.',
    level: 'Beginner',
    github: '',
    linkedin: '',
    portfolio: '',
  },
  projects: [],
  learning: [],
  goals: [],
  skills: [],
  activities: [],
  settings: {
    theme: 'light',
  },
};

/** The live application state. Populated by loadData() on startup. */
let appState = null;

/** Non-persistent UI state (current view, active filters, modal handlers). */
const uiState = {
  currentView: 'dashboard',
  projectSearch: '',
  projectStatusFilter: 'all',
  projectTechFilter: 'all',
  goalFilter: 'all',
  pendingConfirmAction: null,
  clockIntervalId: null,
};

/* =========================================================================
   2. DOM SELECTORS
   Centralised so markup IDs only need to be updated in one place.
   ========================================================================= */

const dom = {
  sidebar: document.getElementById('sidebar'),
  sidebarToggle: document.getElementById('sidebarToggle'),
  sidebarScrim: document.getElementById('sidebarScrim'),
  navList: document.getElementById('navList'),
  viewTitle: document.getElementById('viewTitle'),
  themeToggleSidebar: document.getElementById('themeToggleSidebar'),
  themeToggleTop: document.getElementById('themeToggleTop'),
  profileShortcut: document.getElementById('profileShortcut'),
  topAvatar: document.getElementById('topAvatar'),

  bottomNavLinks: document.querySelectorAll('.bottom-nav__link'),
  moreSheet: document.getElementById('moreSheet'),
  closeMoreSheet: document.getElementById('closeMoreSheet'),

  // Dashboard
  dashDate: document.getElementById('dashDate'),
  dashWelcome: document.getElementById('dashWelcome'),
  dashClock: document.getElementById('dashClock'),
  statGrid: document.getElementById('statGrid'),
  progressRing: document.getElementById('progressRing'),
  progressRingValue: document.getElementById('progressRingValue'),
  progressBreakdown: document.getElementById('progressBreakdown'),
  dashActivityList: document.getElementById('dashActivityList'),

  // Projects
  addProjectBtn: document.getElementById('addProjectBtn'),
  projectSearch: document.getElementById('projectSearch'),
  projectStatusFilter: document.getElementById('projectStatusFilter'),
  projectTechFilter: document.getElementById('projectTechFilter'),
  projectGrid: document.getElementById('projectGrid'),
  projectEmptyState: document.getElementById('projectEmptyState'),

  // Learning
  addLearningBtn: document.getElementById('addLearningBtn'),
  learningStatGrid: document.getElementById('learningStatGrid'),
  learningList: document.getElementById('learningList'),
  learningEmptyState: document.getElementById('learningEmptyState'),

  // Goals
  addGoalBtn: document.getElementById('addGoalBtn'),
  goalFilter: document.getElementById('goalFilter'),
  goalGrid: document.getElementById('goalGrid'),
  goalEmptyState: document.getElementById('goalEmptyState'),

  // Skills
  addSkillBtn: document.getElementById('addSkillBtn'),
  skillsColumns: document.getElementById('skillsColumns'),
  skillsEmptyState: document.getElementById('skillsEmptyState'),

  // Activity
  addActivityBtn: document.getElementById('addActivityBtn'),
  fullActivityList: document.getElementById('fullActivityList'),
  activityEmptyState: document.getElementById('activityEmptyState'),

  // Profile
  editProfileBtn: document.getElementById('editProfileBtn'),
  profileCard: document.getElementById('profileCard'),

  // Settings
  settingsThemeBtn: document.getElementById('settingsThemeBtn'),
  settingsThemeLabel: document.getElementById('settingsThemeLabel'),
  clearDataBtn: document.getElementById('clearDataBtn'),

  // Modal / confirm / toast
  modalOverlay: document.getElementById('modalOverlay'),
  modal: document.getElementById('modal'),
  modalTitle: document.getElementById('modalTitle'),
  modalBody: document.getElementById('modalBody'),
  modalClose: document.getElementById('modalClose'),
  confirmOverlay: document.getElementById('confirmOverlay'),
  confirmTitle: document.getElementById('confirmTitle'),
  confirmMessage: document.getElementById('confirmMessage'),
  confirmCancel: document.getElementById('confirmCancel'),
  confirmAccept: document.getElementById('confirmAccept'),
  toastStack: document.getElementById('toastStack'),
};

/* =========================================================================
   3. LOCALSTORAGE / DATA MANAGEMENT
   loadData() and saveData() are the only functions that touch
   window.localStorage. Everything else goes through appState.
   ========================================================================= */

/**
 * Loads DevTrack data from localStorage, merging it over the defaults so
 * new fields introduced in later versions don't break existing users.
 * Falls back to a fresh default state if nothing is stored or the stored
 * value is corrupted.
 */
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredCloneState(DEFAULT_STATE);

    const parsed = JSON.parse(raw);
    return {
      user: { ...DEFAULT_STATE.user, ...parsed.user },
      projects: Array.isArray(parsed.projects) ? parsed.projects : [],
      learning: Array.isArray(parsed.learning) ? parsed.learning : [],
      goals: Array.isArray(parsed.goals) ? parsed.goals : [],
      skills: Array.isArray(parsed.skills) ? parsed.skills : [],
      activities: Array.isArray(parsed.activities) ? parsed.activities : [],
      settings: { ...DEFAULT_STATE.settings, ...parsed.settings },
    };
  } catch (error) {
    console.error('DevTrack: failed to load saved data, starting fresh.', error);
    return structuredCloneState(DEFAULT_STATE);
  }
}

/** Persists the current appState to localStorage. */
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    return true;
  } catch (error) {
    console.error('DevTrack: failed to save data.', error);
    showNotification('Could not save your data. Local storage may be full.', 'error');
    return false;
  }
}

function structuredCloneState(state) {
  return JSON.parse(JSON.stringify(state));
}

/** Wipes all DevTrack data and resets the app to first-run defaults. */
function clearAllData() {
  localStorage.removeItem(STORAGE_KEY);
  appState = structuredCloneState(DEFAULT_STATE);
  saveData();
  renderAll();
  showNotification('All local data has been cleared.', 'info');
}

/* =========================================================================
   4. UTILITY HELPERS
   Small, reusable, single-purpose functions used across every section.
   ========================================================================= */

/** Generates a reasonably unique id without external dependencies. */
function generateId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Escapes text before it is injected into innerHTML, to avoid HTML/script injection. */
function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value ?? '';
  return div.innerHTML;
}

/** Clamps a number between a min and max value. */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** Formats an ISO timestamp as "Mon 8 Sep, 14:30". */
function formatDateTime(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Formats an ISO date as "8 Sep 2026" for deadlines. */
function formatDate(isoString) {
  if (!isoString) return 'No deadline';
  const date = new Date(isoString);
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Returns a relative "time ago" string for activity feeds. */
function timeAgo(isoString) {
  const seconds = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  const steps = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ];
  for (const [label, secondsInUnit] of steps) {
    const value = Math.floor(seconds / secondsInUnit);
    if (value >= 1) return `${value} ${label}${value > 1 ? 's' : ''} ago`;
  }
  return 'Just now';
}

/** Converts a free-text technology string into a clean, de-duplicated array. */
function parseTechList(rawInput) {
  return [...new Set(
    rawInput
      .split(',')
      .map((tech) => tech.trim())
      .filter(Boolean)
  )];
}

/** Turns a deadline date into a countdown/overdue label for goal cards. */
function describeDeadline(deadline, completed) {
  if (!deadline) return 'No deadline set';
  if (completed) return `Deadline was ${formatDate(deadline)}`;
  const daysLeft = Math.ceil((new Date(deadline) - new Date()) / 86400000);
  if (daysLeft < 0) return `Overdue by ${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'}`;
  if (daysLeft === 0) return 'Due today';
  return `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`;
}

/* =========================================================================
   5. USER / PROFILE MANAGEMENT
   ========================================================================= */

function updateProfile(updates) {
  appState.user = { ...appState.user, ...updates };
  saveData();
  renderProfile();
  renderTopAvatar();
  renderDashboard();
  showNotification('Profile updated.', 'success');
}

function getInitials(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'DT';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function renderTopAvatar() {
  dom.topAvatar.textContent = getInitials(appState.user.name);
}

function renderProfile() {
  const { user } = appState;
  const links = [
    { key: 'github', icon: 'fa-brands fa-github', label: 'GitHub' },
    { key: 'linkedin', icon: 'fa-brands fa-linkedin', label: 'LinkedIn' },
    { key: 'portfolio', icon: 'fa-solid fa-globe', label: 'Portfolio' },
  ]
    .filter((link) => user[link.key])
    .map((link) => `
      <a href="${escapeHtml(user[link.key])}" target="_blank" rel="noopener noreferrer">
        <i class="${link.icon}"></i> ${link.label}
      </a>
    `)
    .join('');

  dom.profileCard.innerHTML = `
    <div class="profile-card__avatar">${escapeHtml(getInitials(user.name))}</div>
    <div>
      <h2 class="profile-card__name">${escapeHtml(user.name)}</h2>
      <p class="profile-card__username">@${escapeHtml(user.username)}</p>
      <span class="profile-card__level">${escapeHtml(user.level)}</span>
      <p class="profile-card__bio">${escapeHtml(user.bio)}</p>
      <div class="profile-card__links">${links || '<p>No links added yet.</p>'}</div>
    </div>
  `;
}

function openEditProfileModal() {
  const { user } = appState;
  const fields = `
    <div class="form-row">
      <div class="form-field">
        <label for="f-name">Full name</label>
        <input id="f-name" type="text" value="${escapeHtml(user.name)}" required />
      </div>
      <div class="form-field">
        <label for="f-username">Username</label>
        <input id="f-username" type="text" value="${escapeHtml(user.username)}" required />
      </div>
    </div>
    <div class="form-field">
      <label for="f-bio">Short bio</label>
      <textarea id="f-bio" maxlength="180">${escapeHtml(user.bio)}</textarea>
    </div>
    <div class="form-field">
      <label for="f-level">Developer level</label>
      <select id="f-level">
        ${['Beginner', 'Intermediate', 'Advanced', 'Professional']
          .map((level) => `<option value="${level}" ${user.level === level ? 'selected' : ''}>${level}</option>`)
          .join('')}
      </select>
    </div>
    <div class="form-field">
      <label for="f-github">GitHub URL</label>
      <input id="f-github" type="url" placeholder="https://github.com/username" value="${escapeHtml(user.github)}" />
    </div>
    <div class="form-field">
      <label for="f-linkedin">LinkedIn URL</label>
      <input id="f-linkedin" type="url" placeholder="https://linkedin.com/in/username" value="${escapeHtml(user.linkedin)}" />
    </div>
    <div class="form-field">
      <label for="f-portfolio">Portfolio URL</label>
      <input id="f-portfolio" type="url" placeholder="https://yourname.dev" value="${escapeHtml(user.portfolio)}" />
    </div>
    <p class="form-error" id="f-error"></p>
    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="f-cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">Save profile</button>
    </div>
  `;

  openModal('Edit profile', fields, (formEl) => {
    formEl.querySelector('#f-cancel').addEventListener('click', closeModal);
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = formEl.querySelector('#f-name').value.trim();
      const username = formEl.querySelector('#f-username').value.trim();
      const errorEl = formEl.querySelector('#f-error');

      if (!name || !username) {
        errorEl.textContent = 'Name and username are required.';
        return;
      }

      updateProfile({
        name,
        username,
        bio: formEl.querySelector('#f-bio').value.trim(),
        level: formEl.querySelector('#f-level').value,
        github: formEl.querySelector('#f-github').value.trim(),
        linkedin: formEl.querySelector('#f-linkedin').value.trim(),
        portfolio: formEl.querySelector('#f-portfolio').value.trim(),
      });
      closeModal();
    });
  });
}

/* =========================================================================
   6. PROJECT MANAGEMENT
   ========================================================================= */

const PROJECT_STATUSES = {
  planned: 'Planned',
  'in-progress': 'In progress',
  completed: 'Completed',
  'on-hold': 'On hold',
};

function addProject(data) {
  const project = {
    id: generateId('proj'),
    name: data.name,
    description: data.description,
    technologies: data.technologies,
    status: data.status,
    progress: data.status === 'completed' ? 100 : clamp(data.progress, 0, 100),
    link: data.link,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: data.status === 'completed' ? new Date().toISOString() : null,
  };
  appState.projects.unshift(project);
  addActivity('project-started', `Started project "${project.name}"`);
  saveData();
  renderProjects();
  renderDashboard();
  showNotification(`Project "${project.name}" created.`, 'success');
}

function editProject(id, data) {
  const project = appState.projects.find((item) => item.id === id);
  if (!project) return;

  const wasCompleted = project.status === 'completed';
  Object.assign(project, {
    name: data.name,
    description: data.description,
    technologies: data.technologies,
    status: data.status,
    progress: data.status === 'completed' ? 100 : clamp(data.progress, 0, 100),
    link: data.link,
    updatedAt: new Date().toISOString(),
  });

  if (!wasCompleted && data.status === 'completed') {
    project.completedAt = new Date().toISOString();
    addActivity('project-completed', `Completed project "${project.name}"`);
  }

  saveData();
  renderProjects();
  renderDashboard();
  showNotification(`Project "${project.name}" updated.`, 'success');
}

function deleteProject(id) {
  const project = appState.projects.find((item) => item.id === id);
  if (!project) return;
  appState.projects = appState.projects.filter((item) => item.id !== id);
  saveData();
  renderProjects();
  renderDashboard();
  showNotification(`Project "${project.name}" deleted.`, 'info');
}

function markProjectCompleted(id) {
  const project = appState.projects.find((item) => item.id === id);
  if (!project || project.status === 'completed') return;
  editProject(id, { ...project, status: 'completed' });
}

/** Applies the current search text and status/technology filters. */
function filterProjects() {
  const search = uiState.projectSearch.trim().toLowerCase();
  return appState.projects.filter((project) => {
    const matchesSearch = !search || project.name.toLowerCase().includes(search);
    const matchesStatus = uiState.projectStatusFilter === 'all' || project.status === uiState.projectStatusFilter;
    const matchesTech = uiState.projectTechFilter === 'all' || project.technologies.includes(uiState.projectTechFilter);
    return matchesSearch && matchesStatus && matchesTech;
  });
}

function renderProjectTechFilterOptions() {
  const allTech = appState.projects.reduce((set, project) => {
    project.technologies.forEach((tech) => set.add(tech));
    return set;
  }, new Set());

  const current = uiState.projectTechFilter;
  dom.projectTechFilter.innerHTML = `<option value="all">All technologies</option>${[...allTech]
    .sort()
    .map((tech) => `<option value="${escapeHtml(tech)}">${escapeHtml(tech)}</option>`)
    .join('')}`;
  dom.projectTechFilter.value = [...allTech].includes(current) ? current : 'all';
}

function renderProjects() {
  renderProjectTechFilterOptions();
  const projects = filterProjects();
  dom.projectEmptyState.hidden = projects.length > 0;
  dom.projectGrid.innerHTML = projects.map(projectCardTemplate).join('');
}

function projectCardTemplate(project) {
  return `
    <article class="entity-card" data-project-id="${project.id}">
      <div class="entity-card__head">
        <div>
          <h3 class="entity-card__title">${escapeHtml(project.name)}</h3>
          <span class="badge badge--${project.status}">${PROJECT_STATUSES[project.status]}</span>
        </div>
        <div class="entity-card__actions">
          <button class="icon-action" data-action="edit-project" aria-label="Edit project"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-action is-danger" data-action="delete-project" aria-label="Delete project"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <p class="entity-card__desc">${escapeHtml(project.description) || 'No description added.'}</p>
      ${project.technologies.length ? `<div class="tech-tags">${project.technologies.map((tech) => `<span class="tech-tag">${escapeHtml(tech)}</span>`).join('')}</div>` : ''}
      <div>
        <div class="progress-row"><span>Progress</span><span>${project.progress}%</span></div>
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${project.progress}%"></div></div>
      </div>
      <div class="entity-card__footer">
        <div class="entity-card__links">
          ${project.link ? `<a href="${escapeHtml(project.link)}" target="_blank" rel="noopener noreferrer"><i class="fa-solid fa-link"></i> Link</a>` : '<span></span>'}
        </div>
        ${project.status !== 'completed'
          ? `<button class="link-btn" data-action="complete-project">Mark complete</button>`
          : ''}
      </div>
    </article>
  `;
}

function openProjectModal(existingProject) {
  const isEdit = Boolean(existingProject);
  const project = existingProject || { name: '', description: '', technologies: [], status: 'planned', progress: 0, link: '' };

  const body = `
    <div class="form-field">
      <label for="p-name">Project name</label>
      <input id="p-name" type="text" value="${escapeHtml(project.name)}" required />
    </div>
    <div class="form-field">
      <label for="p-desc">Description</label>
      <textarea id="p-desc">${escapeHtml(project.description)}</textarea>
    </div>
    <div class="form-field">
      <label for="p-tech">Technologies (comma separated)</label>
      <input id="p-tech" type="text" placeholder="React, Node.js, MongoDB" value="${escapeHtml(project.technologies.join(', '))}" />
    </div>
    <div class="form-row">
      <div class="form-field">
        <label for="p-status">Status</label>
        <select id="p-status">
          ${Object.entries(PROJECT_STATUSES).map(([value, label]) => `<option value="${value}" ${project.status === value ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="p-link">Project link</label>
        <input id="p-link" type="url" placeholder="https://github.com/…" value="${escapeHtml(project.link)}" />
      </div>
    </div>
    <div class="form-field">
      <label for="p-progress">Progress</label>
      <div class="range-field">
        <input id="p-progress" type="range" min="0" max="100" value="${project.progress}" />
        <output id="p-progress-out">${project.progress}%</output>
      </div>
    </div>
    <p class="form-error" id="p-error"></p>
    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="p-cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">${isEdit ? 'Save changes' : 'Create project'}</button>
    </div>
  `;

  openModal(isEdit ? 'Edit project' : 'New project', body, (formEl) => {
    const range = formEl.querySelector('#p-progress');
    const rangeOut = formEl.querySelector('#p-progress-out');
    range.addEventListener('input', () => { rangeOut.textContent = `${range.value}%`; });

    formEl.querySelector('#p-cancel').addEventListener('click', closeModal);
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = formEl.querySelector('#p-name').value.trim();
      const errorEl = formEl.querySelector('#p-error');

      if (!name) {
        errorEl.textContent = 'Project name is required.';
        return;
      }

      const data = {
        name,
        description: formEl.querySelector('#p-desc').value.trim(),
        technologies: parseTechList(formEl.querySelector('#p-tech').value),
        status: formEl.querySelector('#p-status').value,
        progress: Number(range.value),
        link: formEl.querySelector('#p-link').value.trim(),
      };

      if (isEdit) {
        editProject(existingProject.id, data);
      } else {
        addProject(data);
      }
      closeModal();
    });
  });
}

/* =========================================================================
   7. LEARNING MANAGEMENT
   ========================================================================= */

function addLearningTopic(data) {
  const topic = {
    id: generateId('learn'),
    topic: data.topic,
    progress: clamp(data.progress, 0, 100),
    completed: data.progress >= 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  appState.learning.unshift(topic);
  addActivity('learning', `Started learning ${topic.topic}`);
  saveData();
  renderLearning();
  renderDashboard();
  showNotification(`Added "${topic.topic}" to your learning list.`, 'success');
}

function updateLearningProgress(id, progress) {
  const topic = appState.learning.find((item) => item.id === id);
  if (!topic) return;
  const clamped = clamp(progress, 0, 100);
  const justCompleted = clamped >= 100 && !topic.completed;

  topic.progress = clamped;
  topic.completed = clamped >= 100;
  topic.updatedAt = new Date().toISOString();

  if (justCompleted) addActivity('learning-completed', `Completed learning ${topic.topic}`);

  saveData();
  renderLearning();
  renderDashboard();
}

function deleteLearningTopic(id) {
  const topic = appState.learning.find((item) => item.id === id);
  if (!topic) return;
  appState.learning = appState.learning.filter((item) => item.id !== id);
  saveData();
  renderLearning();
  renderDashboard();
  showNotification(`Removed "${topic.topic}" from learning.`, 'info');
}

function renderLearning() {
  const topics = appState.learning;
  dom.learningEmptyState.hidden = topics.length > 0;

  dom.learningList.innerHTML = topics.map((topic) => `
    <li class="topic-row" data-topic-id="${topic.id}">
      <span class="topic-row__icon"><i class="fa-solid ${topic.completed ? 'fa-circle-check' : 'fa-book'}"></i></span>
      <div>
        <div class="topic-row__name">${escapeHtml(topic.topic)}</div>
        <div class="topic-row__meta">${topic.completed ? 'Completed' : 'In progress'} · updated ${timeAgo(topic.updatedAt)}</div>
      </div>
      <div class="topic-row__progress">
        <div class="progress-bar"><div class="progress-bar__fill" style="width:${topic.progress}%"></div></div>
        <input type="range" min="0" max="100" value="${topic.progress}" data-action="update-learning" aria-label="Update progress for ${escapeHtml(topic.topic)}" style="width:100%;margin-top:6px;" />
      </div>
      <div class="topic-row__actions">
        <button class="icon-action is-danger" data-action="delete-learning" aria-label="Delete topic"><i class="fa-solid fa-trash"></i></button>
      </div>
    </li>
  `).join('');

  const total = topics.length;
  const completed = topics.filter((topic) => topic.completed).length;
  const avgProgress = total ? Math.round(topics.reduce((sum, topic) => sum + topic.progress, 0) / total) : 0;

  dom.learningStatGrid.innerHTML = [
    statCardTemplate('fa-book-open', total, 'Topics tracked', 'info'),
    statCardTemplate('fa-circle-check', completed, 'Completed', 'success'),
    statCardTemplate('fa-chart-line', `${avgProgress}%`, 'Average progress', 'warning'),
  ].join('');
}

function openLearningModal() {
  const body = `
    <div class="form-field">
      <label for="l-topic">Topic or technology</label>
      <input id="l-topic" type="text" placeholder="e.g. JavaScript, Git, SQL" required />
    </div>
    <div class="form-field">
      <label for="l-progress">Starting progress</label>
      <div class="range-field">
        <input id="l-progress" type="range" min="0" max="100" value="0" />
        <output id="l-progress-out">0%</output>
      </div>
    </div>
    <p class="form-error" id="l-error"></p>
    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="l-cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">Add topic</button>
    </div>
  `;

  openModal('Add learning topic', body, (formEl) => {
    const range = formEl.querySelector('#l-progress');
    const out = formEl.querySelector('#l-progress-out');
    range.addEventListener('input', () => { out.textContent = `${range.value}%`; });

    formEl.querySelector('#l-cancel').addEventListener('click', closeModal);
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const topic = formEl.querySelector('#l-topic').value.trim();
      if (!topic) {
        formEl.querySelector('#l-error').textContent = 'Please name a topic.';
        return;
      }
      addLearningTopic({ topic, progress: Number(range.value) });
      closeModal();
    });
  });
}

/* =========================================================================
   8. GOAL MANAGEMENT
   ========================================================================= */

function addGoal(data) {
  const goal = {
    id: generateId('goal'),
    title: data.title,
    description: data.description,
    deadline: data.deadline || null,
    completed: false,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
  appState.goals.unshift(goal);
  addActivity('goal', `Set a new goal: "${goal.title}"`);
  saveData();
  renderGoals();
  renderDashboard();
  showNotification('Goal created.', 'success');
}

function editGoal(id, data) {
  const goal = appState.goals.find((item) => item.id === id);
  if (!goal) return;
  Object.assign(goal, { title: data.title, description: data.description, deadline: data.deadline || null });
  saveData();
  renderGoals();
  showNotification('Goal updated.', 'success');
}

function toggleGoalCompleted(id) {
  const goal = appState.goals.find((item) => item.id === id);
  if (!goal) return;
  goal.completed = !goal.completed;
  goal.completedAt = goal.completed ? new Date().toISOString() : null;
  if (goal.completed) addActivity('goal-completed', `Completed goal: "${goal.title}"`);
  saveData();
  renderGoals();
  renderDashboard();
}

function deleteGoal(id) {
  const goal = appState.goals.find((item) => item.id === id);
  if (!goal) return;
  appState.goals = appState.goals.filter((item) => item.id !== id);
  saveData();
  renderGoals();
  renderDashboard();
  showNotification(`Goal "${goal.title}" deleted.`, 'info');
}

function getFilteredGoals() {
  if (uiState.goalFilter === 'active') return appState.goals.filter((goal) => !goal.completed);
  if (uiState.goalFilter === 'completed') return appState.goals.filter((goal) => goal.completed);
  return appState.goals;
}

function renderGoals() {
  const goals = getFilteredGoals();
  dom.goalEmptyState.hidden = goals.length > 0;
  dom.goalGrid.innerHTML = goals.map(goalCardTemplate).join('');
}

function goalCardTemplate(goal) {
  return `
    <article class="entity-card" data-goal-id="${goal.id}">
      <div class="entity-card__head">
        <div>
          <h3 class="entity-card__title">${escapeHtml(goal.title)}</h3>
          <span class="badge ${goal.completed ? 'badge--completed' : 'badge--in-progress'}">${goal.completed ? 'Completed' : 'Active'}</span>
        </div>
        <div class="entity-card__actions">
          <button class="icon-action" data-action="edit-goal" aria-label="Edit goal"><i class="fa-solid fa-pen"></i></button>
          <button class="icon-action is-danger" data-action="delete-goal" aria-label="Delete goal"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
      <p class="entity-card__desc">${escapeHtml(goal.description) || 'No description added.'}</p>
      <div class="progress-row"><span><i class="fa-regular fa-calendar"></i> ${escapeHtml(describeDeadline(goal.deadline, goal.completed))}</span></div>
      <div class="entity-card__footer">
        <span></span>
        <button class="link-btn" data-action="toggle-goal">${goal.completed ? 'Mark active' : 'Mark complete'}</button>
      </div>
    </article>
  `;
}

function openGoalModal(existingGoal) {
  const isEdit = Boolean(existingGoal);
  const goal = existingGoal || { title: '', description: '', deadline: '' };

  const body = `
    <div class="form-field">
      <label for="g-title">Goal title</label>
      <input id="g-title" type="text" value="${escapeHtml(goal.title)}" required />
    </div>
    <div class="form-field">
      <label for="g-desc">Description</label>
      <textarea id="g-desc">${escapeHtml(goal.description)}</textarea>
    </div>
    <div class="form-field">
      <label for="g-deadline">Deadline</label>
      <input id="g-deadline" type="date" value="${goal.deadline ? goal.deadline.slice(0, 10) : ''}" />
    </div>
    <p class="form-error" id="g-error"></p>
    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="g-cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">${isEdit ? 'Save changes' : 'Create goal'}</button>
    </div>
  `;

  openModal(isEdit ? 'Edit goal' : 'New goal', body, (formEl) => {
    formEl.querySelector('#g-cancel').addEventListener('click', closeModal);
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const title = formEl.querySelector('#g-title').value.trim();
      if (!title) {
        formEl.querySelector('#g-error').textContent = 'Goal title is required.';
        return;
      }
      const data = {
        title,
        description: formEl.querySelector('#g-desc').value.trim(),
        deadline: formEl.querySelector('#g-deadline').value,
      };
      if (isEdit) {
        editGoal(existingGoal.id, data);
      } else {
        addGoal(data);
      }
      closeModal();
    });
  });
}

/* =========================================================================
   9. SKILL MANAGEMENT
   ========================================================================= */

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Expert'];

function addSkill(data) {
  const skill = {
    id: generateId('skill'),
    name: data.name,
    category: data.category,
    level: data.level,
    progress: clamp(data.progress, 0, 100),
  };
  appState.skills.push(skill);
  saveData();
  renderSkills();
  renderDashboard();
  showNotification(`Added skill "${skill.name}".`, 'success');
}

function editSkill(id, data) {
  const skill = appState.skills.find((item) => item.id === id);
  if (!skill) return;
  Object.assign(skill, { name: data.name, category: data.category, level: data.level, progress: clamp(data.progress, 0, 100) });
  saveData();
  renderSkills();
  showNotification(`Updated skill "${skill.name}".`, 'success');
}

function deleteSkill(id) {
  const skill = appState.skills.find((item) => item.id === id);
  if (!skill) return;
  appState.skills = appState.skills.filter((item) => item.id !== id);
  saveData();
  renderSkills();
  renderDashboard();
  showNotification(`Removed skill "${skill.name}".`, 'info');
}

/** Groups skills by category for the column layout. */
function groupSkillsByCategory() {
  return appState.skills.reduce((groups, skill) => {
    if (!groups[skill.category]) groups[skill.category] = [];
    groups[skill.category].push(skill);
    return groups;
  }, {});
}

function renderSkills() {
  const grouped = groupSkillsByCategory();
  const categories = Object.keys(grouped).sort();
  dom.skillsEmptyState.hidden = appState.skills.length > 0;

  dom.skillsColumns.innerHTML = categories.map((category) => `
    <div class="skill-column">
      <h3>${escapeHtml(category)}</h3>
      ${grouped[category].map((skill) => `
        <div class="skill-row" data-skill-id="${skill.id}">
          <div class="skill-row__top">
            <span class="skill-row__name">${escapeHtml(skill.name)}</span>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="skill-row__level">${escapeHtml(skill.level)} · ${skill.progress}%</span>
              <div class="skill-row__actions">
                <button class="icon-action" data-action="edit-skill" aria-label="Edit skill"><i class="fa-solid fa-pen"></i></button>
                <button class="icon-action is-danger" data-action="delete-skill" aria-label="Delete skill"><i class="fa-solid fa-trash"></i></button>
              </div>
            </div>
          </div>
          <div class="progress-bar"><div class="progress-bar__fill" style="width:${skill.progress}%"></div></div>
        </div>
      `).join('')}
    </div>
  `).join('');
}

function openSkillModal(existingSkill) {
  const isEdit = Boolean(existingSkill);
  const skill = existingSkill || { name: '', category: 'Frontend', level: 'Beginner', progress: 0 };
  const categories = ['Frontend', 'Backend', 'Database', 'DevOps', 'Programming Languages', 'Tools', 'Cloud', 'Cybersecurity'];

  const body = `
    <div class="form-field">
      <label for="s-name">Skill name</label>
      <input id="s-name" type="text" placeholder="e.g. JavaScript" value="${escapeHtml(skill.name)}" required />
    </div>
    <div class="form-row">
      <div class="form-field">
        <label for="s-category">Category</label>
        <select id="s-category">
          ${categories.map((cat) => `<option value="${cat}" ${skill.category === cat ? 'selected' : ''}>${cat}</option>`).join('')}
        </select>
      </div>
      <div class="form-field">
        <label for="s-level">Proficiency level</label>
        <select id="s-level">
          ${SKILL_LEVELS.map((level) => `<option value="${level}" ${skill.level === level ? 'selected' : ''}>${level}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-field">
      <label for="s-progress">Progress</label>
      <div class="range-field">
        <input id="s-progress" type="range" min="0" max="100" value="${skill.progress}" />
        <output id="s-progress-out">${skill.progress}%</output>
      </div>
    </div>
    <p class="form-error" id="s-error"></p>
    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="s-cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">${isEdit ? 'Save changes' : 'Add skill'}</button>
    </div>
  `;

  openModal(isEdit ? 'Edit skill' : 'Add skill', body, (formEl) => {
    const range = formEl.querySelector('#s-progress');
    const out = formEl.querySelector('#s-progress-out');
    range.addEventListener('input', () => { out.textContent = `${range.value}%`; });

    formEl.querySelector('#s-cancel').addEventListener('click', closeModal);
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = formEl.querySelector('#s-name').value.trim();
      if (!name) {
        formEl.querySelector('#s-error').textContent = 'Skill name is required.';
        return;
      }
      const data = {
        name,
        category: formEl.querySelector('#s-category').value,
        level: formEl.querySelector('#s-level').value,
        progress: Number(range.value),
      };
      if (isEdit) {
        editSkill(existingSkill.id, data);
      } else {
        addSkill(data);
      }
      closeModal();
    });
  });
}

/* =========================================================================
   10. ACTIVITY MANAGEMENT
   ========================================================================= */

const ACTIVITY_ICONS = {
  'project-started': 'fa-diagram-project',
  'project-completed': 'fa-circle-check',
  learning: 'fa-book',
  'learning-completed': 'fa-graduation-cap',
  goal: 'fa-bullseye',
  'goal-completed': 'fa-flag-checkered',
  manual: 'fa-pen',
};

/** Records an activity entry. Called both automatically and manually. */
function addActivity(type, text) {
  const activity = {
    id: generateId('act'),
    type,
    text,
    timestamp: new Date().toISOString(),
  };
  appState.activities.unshift(activity);
  appState.activities = appState.activities.slice(0, 200); // keep the log bounded
  saveData();
  renderActivityLists();
}

function deleteActivity(id) {
  appState.activities = appState.activities.filter((item) => item.id !== id);
  saveData();
  renderActivityLists();
}

function activityItemTemplate(activity) {
  const icon = ACTIVITY_ICONS[activity.type] || 'fa-circle-info';
  return `
    <li class="activity-item" data-activity-id="${activity.id}">
      <span class="activity-item__icon"><i class="fa-solid ${icon}"></i></span>
      <div class="activity-item__body">
        <div class="activity-item__text">${escapeHtml(activity.text)}</div>
        <div class="activity-item__time">${escapeHtml(formatDateTime(activity.timestamp))} · ${timeAgo(activity.timestamp)}</div>
      </div>
      <button class="icon-action is-danger" data-action="delete-activity" aria-label="Delete activity entry"><i class="fa-solid fa-xmark"></i></button>
    </li>
  `;
}

function renderActivityLists() {
  const recent = appState.activities.slice(0, 6);
  dom.dashActivityList.innerHTML = recent.length
    ? recent.map(activityItemTemplate).join('')
    : '<p class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><span>No activity yet.</span></p>';

  dom.activityEmptyState.hidden = appState.activities.length > 0;
  dom.fullActivityList.innerHTML = appState.activities.map(activityItemTemplate).join('');
}

function openActivityModal() {
  const body = `
    <div class="form-field">
      <label for="a-text">What did you do?</label>
      <input id="a-text" type="text" placeholder="e.g. Completed a coding challenge" required />
    </div>
    <p class="form-error" id="a-error"></p>
    <div class="modal__actions">
      <button type="button" class="btn btn--ghost" id="a-cancel">Cancel</button>
      <button type="submit" class="btn btn--primary">Log activity</button>
    </div>
  `;
  openModal('Log an activity', body, (formEl) => {
    formEl.querySelector('#a-cancel').addEventListener('click', closeModal);
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
      const text = formEl.querySelector('#a-text').value.trim();
      if (!text) {
        formEl.querySelector('#a-error').textContent = 'Please describe the activity.';
        return;
      }
      addActivity('manual', text);
      closeModal();
    });
  });
}

/* =========================================================================
   11. DASHBOARD STATISTICS
   ========================================================================= */

function statCardTemplate(icon, value, label, tone) {
  return `
    <div class="stat-card">
      <div class="stat-card__top">
        <span class="stat-card__icon" style="background:var(--${tone}-bg);color:var(--${tone});"><i class="fa-solid ${icon}"></i></span>
      </div>
      <div class="stat-card__value">${value}</div>
      <div class="stat-card__label">${label}</div>
    </div>
  `;
}

/** Calculates every headline number shown on the dashboard from appState. */
function calculateStats() {
  const { projects, learning, goals, skills } = appState;

  const activeProjects = projects.filter((project) => project.status === 'in-progress').length;
  const completedProjects = projects.filter((project) => project.status === 'completed').length;
  const totalProjects = projects.length;

  const activeGoals = goals.filter((goal) => !goal.completed).length;
  const completedGoals = goals.filter((goal) => goal.completed).length;

  const learningAverage = learning.length
    ? Math.round(learning.reduce((sum, topic) => sum + topic.progress, 0) / learning.length)
    : 0;

  const projectAverage = totalProjects
    ? Math.round(projects.reduce((sum, project) => sum + project.progress, 0) / totalProjects)
    : 0;

  const skillAverage = skills.length
    ? Math.round(skills.reduce((sum, skill) => sum + skill.progress, 0) / skills.length)
    : 0;

  const goalCompletionRate = goals.length ? Math.round((completedGoals / goals.length) * 100) : 0;

  const trackedComponents = [projectAverage, learningAverage, skillAverage, goalCompletionRate];
  const overallProgress = Math.round(trackedComponents.reduce((sum, value) => sum + value, 0) / trackedComponents.length);

  return {
    totalProjects,
    activeProjects,
    completedProjects,
    activeGoals,
    completedGoals,
    learningAverage,
    projectAverage,
    skillAverage,
    goalCompletionRate,
    overallProgress,
  };
}

function renderDashboardStats() {
  const stats = calculateStats();

  dom.statGrid.innerHTML = [
    statCardTemplate('fa-diagram-project', stats.totalProjects, 'Total projects', 'info'),
    statCardTemplate('fa-bolt', stats.activeProjects, 'Active projects', 'warning'),
    statCardTemplate('fa-circle-check', stats.completedProjects, 'Completed projects', 'success'),
    statCardTemplate('fa-bullseye', stats.activeGoals, 'Active goals', 'warning'),
    statCardTemplate('fa-flag-checkered', stats.completedGoals, 'Completed goals', 'success'),
    statCardTemplate('fa-book-open', `${stats.learningAverage}%`, 'Learning progress', 'info'),
  ].join('');

  dom.progressRing.style.setProperty('--pct', stats.overallProgress);
  dom.progressRingValue.textContent = `${stats.overallProgress}%`;

  dom.progressBreakdown.innerHTML = `
    <li><span>Projects</span><span>${stats.projectAverage}%</span></li>
    <li><span>Learning</span><span>${stats.learningAverage}%</span></li>
    <li><span>Skills</span><span>${stats.skillAverage}%</span></li>
    <li><span>Goals completed</span><span>${stats.goalCompletionRate}%</span></li>
  `;
}

function renderWelcomeMessage() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = appState.user.name.split(' ')[0] || 'there';
  dom.dashWelcome.textContent = `${greeting}, ${firstName}`;
  dom.dashDate.textContent = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function updateClock() {
  dom.dashClock.textContent = new Date().toLocaleTimeString('en-GB');
}

function renderDashboard() {
  renderWelcomeMessage();
  renderDashboardStats();
}

/* =========================================================================
   12. THEME MANAGEMENT
   ========================================================================= */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const isDark = theme === 'dark';

  [dom.themeToggleSidebar, dom.themeToggleTop].forEach((btn) => {
    const icon = btn.querySelector('i');
    if (icon) icon.className = `fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`;
  });
  const sidebarLabel = dom.themeToggleSidebar.querySelector('span');
  if (sidebarLabel) sidebarLabel.textContent = isDark ? 'Light mode' : 'Dark mode';

  dom.settingsThemeLabel.textContent = isDark ? 'Switch to light' : 'Switch to dark';
  const settingsIcon = dom.settingsThemeBtn.querySelector('i');
  if (settingsIcon) settingsIcon.className = `fa-solid ${isDark ? 'fa-sun' : 'fa-moon'}`;
}

function toggleTheme() {
  appState.settings.theme = appState.settings.theme === 'dark' ? 'light' : 'dark';
  saveData();
  applyTheme(appState.settings.theme);
}

/* =========================================================================
   13. NOTIFICATIONS (TOASTS)
   ========================================================================= */

const TOAST_ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

/** Shows a temporary toast notification. type: 'success' | 'error' | 'info'. */
function showNotification(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.innerHTML = `<i class="fa-solid ${TOAST_ICONS[type] || TOAST_ICONS.info}"></i><span>${escapeHtml(message)}</span>`;
  dom.toastStack.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    toast.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

/* =========================================================================
   14. MODAL MANAGEMENT
   ========================================================================= */

/**
 * Opens the shared modal with a title and body HTML (typically a <form>).
 * `onMount` receives the rendered form element to attach listeners to —
 * keeps each feature responsible for its own form behaviour.
 */
function openModal(title, bodyHtml, onMount) {
  dom.modalTitle.textContent = title;
  dom.modalBody.innerHTML = `<form novalidate>${bodyHtml}</form>`;
  dom.modalOverlay.hidden = false;
  document.body.style.overflow = 'hidden';

  const formEl = dom.modalBody.querySelector('form');
  if (typeof onMount === 'function') onMount(formEl);

  const firstInput = formEl.querySelector('input, select, textarea');
  if (firstInput) firstInput.focus();
}

function closeModal() {
  dom.modalOverlay.hidden = true;
  dom.modalBody.innerHTML = '';
  document.body.style.overflow = '';
}

/** Opens the confirmation dialog and runs `onConfirm` only if the user accepts. */
function openConfirm(title, message, onConfirm) {
  dom.confirmTitle.textContent = title;
  dom.confirmMessage.textContent = message;
  uiState.pendingConfirmAction = onConfirm;
  dom.confirmOverlay.hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeConfirm() {
  dom.confirmOverlay.hidden = true;
  uiState.pendingConfirmAction = null;
  document.body.style.overflow = '';
}

/* =========================================================================
   15. NAVIGATION / VIEW RENDERING
   ========================================================================= */

const VIEW_TITLES = {
  dashboard: 'Dashboard',
  projects: 'Projects',
  learning: 'Learning',
  goals: 'Goals',
  skills: 'Skills',
  activity: 'Activity',
  profile: 'Profile',
  settings: 'Settings',
};

function navigateTo(view) {
  if (!VIEW_TITLES[view]) return;
  uiState.currentView = view;

  document.querySelectorAll('.view').forEach((section) => {
    section.classList.toggle('is-active', section.dataset.viewPanel === view);
  });

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === view);
  });

  dom.bottomNavLinks.forEach((link) => {
    link.classList.toggle('is-active', link.dataset.view === view);
  });

  dom.viewTitle.textContent = VIEW_TITLES[view];
  closeSidebarOnMobile();
  closeMoreSheetPanel();
}

function closeSidebarOnMobile() {
  dom.sidebar.classList.remove('is-open');
  dom.sidebarScrim.removeAttribute('data-open');
  dom.sidebarScrim.hidden = true;
}

function openMoreSheetPanel() {
  dom.moreSheet.hidden = false;
  dom.moreSheet.setAttribute('data-open', '');
}

function closeMoreSheetPanel() {
  dom.moreSheet.hidden = true;
  dom.moreSheet.removeAttribute('data-open');
}

/* =========================================================================
   16. EVENT LISTENERS
   Delegated where a container renders a dynamic, changing list of items,
   direct where an element is a single static control.
   ========================================================================= */

function setupNavigationListeners() {
  dom.navList.addEventListener('click', (event) => {
    const link = event.target.closest('.nav-link');
    if (link) navigateTo(link.dataset.view);
  });

  document.querySelectorAll('[data-view]').forEach((el) => {
    if (el.closest('#navList') || el.closest('.bottom-nav')) return;
    el.addEventListener('click', () => navigateTo(el.dataset.view));
  });

  dom.bottomNavLinks.forEach((link) => {
    link.addEventListener('click', () => {
      if (link.dataset.view === 'more') {
        openMoreSheetPanel();
      } else {
        navigateTo(link.dataset.view);
      }
    });
  });

  dom.moreSheet.addEventListener('click', (event) => {
    const item = event.target.closest('.sheet__item[data-view]');
    if (item) navigateTo(item.dataset.view);
    if (event.target === dom.moreSheet) closeMoreSheetPanel();
  });
  dom.closeMoreSheet.addEventListener('click', closeMoreSheetPanel);

  dom.sidebarToggle.addEventListener('click', () => {
    const isOpen = dom.sidebar.classList.toggle('is-open');
    dom.sidebarScrim.hidden = !isOpen;
    if (isOpen) dom.sidebarScrim.setAttribute('data-open', '');
    else dom.sidebarScrim.removeAttribute('data-open');
  });
  dom.sidebarScrim.addEventListener('click', closeSidebarOnMobile);
}

function setupThemeListeners() {
  dom.themeToggleSidebar.addEventListener('click', toggleTheme);
  dom.themeToggleTop.addEventListener('click', toggleTheme);
  dom.settingsThemeBtn.addEventListener('click', toggleTheme);
}

function setupModalListeners() {
  dom.modalClose.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', (event) => {
    if (event.target === dom.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!dom.modalOverlay.hidden) closeModal();
      if (!dom.confirmOverlay.hidden) closeConfirm();
      closeMoreSheetPanel();
    }
  });

  dom.confirmCancel.addEventListener('click', closeConfirm);
  dom.confirmAccept.addEventListener('click', () => {
    if (typeof uiState.pendingConfirmAction === 'function') uiState.pendingConfirmAction();
    closeConfirm();
  });
}

function setupProjectListeners() {
  dom.addProjectBtn.addEventListener('click', () => openProjectModal());

  dom.projectSearch.addEventListener('input', (event) => {
    uiState.projectSearch = event.target.value;
    renderProjects();
  });
  dom.projectStatusFilter.addEventListener('change', (event) => {
    uiState.projectStatusFilter = event.target.value;
    renderProjects();
  });
  dom.projectTechFilter.addEventListener('change', (event) => {
    uiState.projectTechFilter = event.target.value;
    renderProjects();
  });

  // Event delegation: the project grid is re-rendered often, so we attach
  // one listener to its stable parent rather than one per card.
  dom.projectGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-project-id]');
    if (!card) return;
    const id = card.dataset.projectId;
    const project = appState.projects.find((item) => item.id === id);
    if (!project) return;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit-project') openProjectModal(project);
    if (action === 'complete-project') markProjectCompleted(id);
    if (action === 'delete-project') {
      openConfirm('Delete project?', `"${project.name}" will be permanently removed.`, () => deleteProject(id));
    }
  });
}

function setupLearningListeners() {
  dom.addLearningBtn.addEventListener('click', openLearningModal);

  dom.learningList.addEventListener('input', (event) => {
    if (event.target.dataset.action !== 'update-learning') return;
    const row = event.target.closest('[data-topic-id]');
    updateLearningProgress(row.dataset.topicId, Number(event.target.value));
  });

  dom.learningList.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action !== 'delete-learning') return;
    const row = event.target.closest('[data-topic-id]');
    const topic = appState.learning.find((item) => item.id === row.dataset.topicId);
    openConfirm('Delete topic?', `"${topic.topic}" will be removed from your learning tracker.`, () => deleteLearningTopic(topic.id));
  });
}

function setupGoalListeners() {
  dom.addGoalBtn.addEventListener('click', () => openGoalModal());

  dom.goalFilter.addEventListener('click', (event) => {
    const btn = event.target.closest('.segmented__btn');
    if (!btn) return;
    uiState.goalFilter = btn.dataset.filter;
    dom.goalFilter.querySelectorAll('.segmented__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
    renderGoals();
  });

  dom.goalGrid.addEventListener('click', (event) => {
    const card = event.target.closest('[data-goal-id]');
    if (!card) return;
    const id = card.dataset.goalId;
    const goal = appState.goals.find((item) => item.id === id);
    if (!goal) return;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit-goal') openGoalModal(goal);
    if (action === 'toggle-goal') toggleGoalCompleted(id);
    if (action === 'delete-goal') {
      openConfirm('Delete goal?', `"${goal.title}" will be permanently removed.`, () => deleteGoal(id));
    }
  });
}

function setupSkillListeners() {
  dom.addSkillBtn.addEventListener('click', () => openSkillModal());

  dom.skillsColumns.addEventListener('click', (event) => {
    const row = event.target.closest('[data-skill-id]');
    if (!row) return;
    const id = row.dataset.skillId;
    const skill = appState.skills.find((item) => item.id === id);
    if (!skill) return;

    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'edit-skill') openSkillModal(skill);
    if (action === 'delete-skill') {
      openConfirm('Delete skill?', `"${skill.name}" will be removed from your skills.`, () => deleteSkill(id));
    }
  });
}

function setupActivityListeners() {
  dom.addActivityBtn.addEventListener('click', openActivityModal);

  [dom.dashActivityList, dom.fullActivityList].forEach((list) => {
    list.addEventListener('click', (event) => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (action !== 'delete-activity') return;
      const item = event.target.closest('[data-activity-id]');
      deleteActivity(item.dataset.activityId);
    });
  });
}

function setupProfileListeners() {
  dom.editProfileBtn.addEventListener('click', openEditProfileModal);
}

function setupSettingsListeners() {
  dom.clearDataBtn.addEventListener('click', () => {
    openConfirm(
      'Clear all local data?',
      'This permanently deletes every project, goal, skill, learning topic and activity stored in this browser.',
      clearAllData
    );
  });
}

function setupAllEventListeners() {
  setupNavigationListeners();
  setupThemeListeners();
  setupModalListeners();
  setupProjectListeners();
  setupLearningListeners();
  setupGoalListeners();
  setupSkillListeners();
  setupActivityListeners();
  setupProfileListeners();
  setupSettingsListeners();
}

/* =========================================================================
   RENDER ORCHESTRATION
   Calls every view's render function — used on startup and after a full
   data reset so every panel reflects the current state.
   ========================================================================= */

function renderAll() {
  renderTopAvatar();
  renderDashboard();
  renderProjects();
  renderLearning();
  renderGoals();
  renderSkills();
  renderActivityLists();
  renderProfile();
  applyTheme(appState.settings.theme);
}

/* =========================================================================
   17. APPLICATION INITIALIZATION
   ========================================================================= */

function initApp() {
  appState = loadData();
  setupAllEventListeners();
  renderAll();
  navigateTo('dashboard');

  updateClock();
  uiState.clockIntervalId = setInterval(updateClock, 1000);
}

document.addEventListener('DOMContentLoaded', initApp);