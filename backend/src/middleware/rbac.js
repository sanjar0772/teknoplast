const ROLE_PERMISSIONS = {
  OWNER: ['*'],
  ACCOUNTANT: [
    'sales:read', 'expenses:read', 'expenses:write',
    'employees:read', 'salaries:read', 'salaries:write',
    'products:read', 'inventory:read', 'reports:read',
    'ai:read'
  ],
  SALES_HEAD: [
    'sales:read', 'sales:write',
    'products:read', 'products:price:read',
    'discounts:read', 'discounts:write',
    'customers:read', 'reports:sales'
  ],
  PRODUCTION_HEAD: [
    'products:read', 'products:write',
    'raw_materials:read', 'raw_materials:write',
    'machines:read', 'machines:write',
    'employees:read', 'production:read', 'production:write',
    'inventory:read', 'reports:production'
  ],
  KIRIMCHI: [
    'products:read', 'intake:read', 'intake:write',
    'inventory:read'
  ],
  OMBORCHI: [
    'products:read', 'inventory:read',
    'sales:read', 'fulfillment:read', 'fulfillment:write'
  ],
  TAMINOTCHI: [
    'raw_materials:read', 'raw_materials:write',
    'inventory:read', 'expenses:read', 'expenses:write'
  ],
  CYCLE_TIME: [
    'machines:read', 'machines:write',
    'products:read'
  ],
  AGENT: [
    // Sotuv agenti — distansion: mijoz topadi, sotadi, dostavka belgilaydi,
    // mijoz manzili/lokatsiyasini qo'shadi, brak tovarni borib ko'rib vozvrat qiladi.
    // O'chirish huquqi YO'Q: mijozni o'chirish faqat EGA'da.
    'sales:read', 'sales:write', 'returns:write',
    'products:read', 'customers:read', 'customers:write'
  ],
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({
      error: `Bu amalni bajarish uchun ${roles.join(' yoki ')} roli kerak`
    });
  }
  next();
};

const requireOwner = requireRole('OWNER');
const requireAccountant = requireRole('OWNER', 'ACCOUNTANT');
const requireSalesHead = requireRole('OWNER', 'SALES_HEAD');
const requireProductionHead = requireRole('OWNER', 'PRODUCTION_HEAD');

module.exports = {
  requireRole,
  requireOwner,
  requireAccountant,
  requireSalesHead,
  requireProductionHead,
  ROLE_PERMISSIONS,
};
