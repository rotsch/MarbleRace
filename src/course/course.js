import { buildFromData, defaultCourse, LAYOUTS } from './pieces.js';

export { LAYOUTS };

// Build the course: a layout name (`full`, or one section on its own for
// testing: `npm run sim -- --layout bottleneck`, ?layout=bottleneck in the
// browser) or course data from the editor (see pieces.js).
export function buildCourse(ctx, course = 'full') {
  buildFromData(ctx, typeof course === 'string' ? defaultCourse(course) : course);
}
