const fs = require('fs');
const file = '/Users/simonyoseph/Beat-Hive/web/src/app/page.tsx';
let c = fs.readFileSync(file, 'utf8');

c = c.replace(`  const zIndex = useTransform(() => {
     const currentZ = z.get();
     const isFeatured = currentZ > (RADIUS - 10);
     // Extremely high z-index ONLY when the item is physically closest and featured
     // to ensure the primary selected shape pops out and overlaps neighbors
     return isFeatured ? Math.round(currentZ + RADIUS + 1000) : Math.round(currentZ + RADIUS);
  });`, `  const zIndex = useTransform(() => {
     const currentZ = z.get();
     // Layer objects strictly by their actual Z depth so they never bleed through each other
     return Math.round(currentZ + RADIUS);
  });`);

fs.writeFileSync(file, c);
console.log('done');
