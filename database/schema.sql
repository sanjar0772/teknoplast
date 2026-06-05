-- ============================================
-- TEKNOPLAST DATABASE SCHEMA (PostgreSQL)
-- ============================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. USERS
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'SALES_HEAD', 'PRODUCTION_HEAD')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. RAW MATERIALS
CREATE TABLE raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
    unit VARCHAR(20) NOT NULL DEFAULT 'kg',
    price_per_unit DECIMAL(12,2) NOT NULL DEFAULT 0,
    received_date DATE,
    last_used_date DATE,
    stock_balance DECIMAL(10,2) NOT NULL DEFAULT 0,
    supplier_name VARCHAR(100),
    min_stock_level DECIMAL(10,2) DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. PRODUCTS
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL DEFAULT 0,
    daily_production INT DEFAULT 0,
    stock_quantity INT DEFAULT 0,
    raw_material_id UUID REFERENCES raw_materials(id),
    unit VARCHAR(20) DEFAULT 'dona',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. DISCOUNTS
CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    discount_type VARCHAR(50) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value DECIMAL(10,2) NOT NULL,
    reason VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. SALES
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(12,2) NOT NULL,
    total_amount DECIMAL(12,2) NOT NULL,
    customer_name VARCHAR(100),
    customer_phone VARCHAR(20),
    sale_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'PARTIALLY_PAID')),
    payment_amount DECIMAL(12,2) DEFAULT 0,
    discount_id UUID REFERENCES discounts(id),
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. EXPENSES
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL CHECK (category IN ('RAW_MATERIAL', 'ENERGY', 'MAINTENANCE', 'SALARY', 'TRANSPORT', 'OTHER')),
    amount DECIMAL(12,2) NOT NULL,
    description TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    receipt_file VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. EMPLOYEES
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('STANOKCHI', 'ISHCHI', 'OSHPAZ', 'SHOFIR', 'BOSHQA')),
    daily_tariff DECIMAL(10,2) NOT NULL DEFAULT 0,
    hourly_tariff DECIMAL(10,2),
    hire_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. MACHINES
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'WORKING' CHECK (status IN ('WORKING', 'BROKEN', 'SERVICE')),
    operator_id UUID REFERENCES employees(id),
    last_service_date DATE,
    next_service_date DATE,
    daily_production_capacity INT DEFAULT 0,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. EMPLOYEE PRODUCTION (Kunlik ishlab chiqarish)
CREATE TABLE employee_production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    product_id UUID REFERENCES products(id),
    machine_id UUID REFERENCES machines(id),
    production_date DATE NOT NULL,
    quantity_produced INT NOT NULL DEFAULT 0,
    daily_tariff DECIMAL(10,2) NOT NULL,
    calculated_amount DECIMAL(12,2) NOT NULL,
    month VARCHAR(7) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, production_date)
);

-- 10. SALARIES
CREATE TABLE salaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    month VARCHAR(7) NOT NULL,
    total_calculated DECIMAL(12,2) NOT NULL DEFAULT 0,
    bonuses DECIMAL(12,2) DEFAULT 0,
    penalties DECIMAL(12,2) DEFAULT 0,
    net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(50) DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED', 'APPROVED', 'PAID')),
    approved_by UUID REFERENCES users(id),
    paid_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, month)
);

-- 11. AI ANALYSES
CREATE TABLE ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL CHECK (type IN ('SALARY_ANALYSIS', 'SALES_FORECAST', 'EXPENSE_OPTIMIZATION', 'PRODUCTION_REPORT', 'DASHBOARD_SUMMARY')),
    period VARCHAR(20),
    analysis_data JSONB NOT NULL DEFAULT '{}',
    recommendations TEXT[],
    status VARCHAR(50) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PROCESSING', 'ERROR')),
    processing_time INT,
    expire_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. SMART ALERTS
CREATE TABLE smart_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL CHECK (type IN ('LOW_STOCK', 'ABSENCE', 'SALES_DROP', 'MAINTENANCE', 'HIGH_INVENTORY', 'EXPENSE_ALERT', 'SALARY_DUE')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    message TEXT NOT NULL,
    triggered_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dismissed_by UUID REFERENCES users(id),
    dismissed_at TIMESTAMP,
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 13. AI CHAT HISTORY
CREATE TABLE ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    context_data JSONB,
    processing_time INT,
    is_helpful BOOLEAN,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 14. AUDIT LOGS
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN', 'LOGOUT')),
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 15. SYSTEM SETTINGS
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_products_name ON products(name);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_raw_materials_name ON raw_materials(name);
CREATE INDEX idx_sales_product ON sales(product_id);
CREATE INDEX idx_sales_date ON sales(sale_date);
CREATE INDEX idx_sales_status ON sales(status);
CREATE INDEX idx_sales_customer ON sales(customer_name);
CREATE INDEX idx_expenses_category ON expenses(category);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_employees_active ON employees(is_active);
CREATE INDEX idx_employees_type ON employees(type);
CREATE INDEX idx_machines_status ON machines(status);
CREATE INDEX idx_emp_prod_employee ON employee_production(employee_id);
CREATE INDEX idx_emp_prod_date ON employee_production(production_date);
CREATE INDEX idx_emp_prod_month ON employee_production(month);
CREATE INDEX idx_salaries_employee ON salaries(employee_id);
CREATE INDEX idx_salaries_month ON salaries(month);
CREATE INDEX idx_salaries_status ON salaries(status);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_time ON audit_logs(created_at);
CREATE INDEX idx_ai_analyses_type ON ai_analyses(type);
CREATE INDEX idx_smart_alerts_severity ON smart_alerts(severity);
CREATE INDEX idx_chat_history_user ON ai_chat_history(user_id);

-- ============================================
-- VIEWS
-- ============================================

CREATE VIEW monthly_sales_summary AS
SELECT
    TO_CHAR(sale_date, 'YYYY-MM') AS month,
    COUNT(*) AS total_sales,
    SUM(quantity) AS total_quantity,
    SUM(total_amount) AS total_revenue,
    SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) AS paid_amount,
    SUM(CASE WHEN status = 'PENDING' THEN total_amount ELSE 0 END) AS pending_amount
FROM sales
GROUP BY TO_CHAR(sale_date, 'YYYY-MM');

CREATE VIEW employee_salary_summary AS
SELECT
    e.id,
    e.name,
    e.type,
    TO_CHAR(CURRENT_DATE, 'YYYY-MM') AS month,
    COALESCE(SUM(ep.quantity_produced), 0) AS total_produced,
    COALESCE(SUM(ep.calculated_amount), 0) AS total_earned
FROM employees e
LEFT JOIN employee_production ep ON e.id = ep.employee_id
    AND ep.month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
WHERE e.is_active = true
GROUP BY e.id, e.name, e.type;

CREATE VIEW daily_production_summary AS
SELECT
    production_date,
    COUNT(DISTINCT employee_id) AS total_workers,
    SUM(quantity_produced) AS total_production,
    SUM(calculated_amount) AS total_earned
FROM employee_production
GROUP BY production_date
ORDER BY production_date DESC;

CREATE VIEW inventory_status AS
SELECT
    p.id,
    p.name,
    p.type,
    p.stock_quantity,
    p.price,
    p.unit,
    rm.name AS raw_material_name,
    rm.stock_balance AS raw_material_stock
FROM products p
LEFT JOIN raw_materials rm ON p.raw_material_id = rm.id
WHERE p.is_active = true;

-- ============================================
-- INITIAL DATA
-- ============================================

INSERT INTO system_settings (key, value, description) VALUES
('company_name', 'TEKNOPLAST', 'Kompaniya nomi'),
('company_phone', '+998901234567', 'Aloqa telefon'),
('timezone', 'Asia/Tashkent', 'Vaqt mintaqasi'),
('currency', 'UZS', 'Valyuta'),
('language', 'uz', 'Til'),
('salary_calculation_day', '25', 'Oylik hisoblash sanasi'),
('min_stock_alert_days', '3', 'Minimal ombor ogohlantirish (kun)');

-- Test owner user (password: Admin123!)
INSERT INTO users (phone, password_hash, full_name, role) VALUES
('+998901234567', '$2b$10$YourHashedPasswordHere', 'Sanjar Rahimov', 'OWNER');
