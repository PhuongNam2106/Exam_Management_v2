import { isTeacherToken } from '../services/authService.mjs';

export function requireTeacher(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';

  if (!isTeacherToken(token)) {
    res.status(401).json({ error: 'Teacher authentication required' });
    return;
  }

  next();
}
