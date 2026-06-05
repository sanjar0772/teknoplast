-- ============================================
-- TEKNOPLAST DATABASE SCHEMA
-- ============================================

-- 1. USERS TABLE (Foydalanuvchilar)
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone VARCHAR(20) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('OWNER', 'ACCOUNTANT', 'SALES_HEAD', 'PRODUCTION_HEAD')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone (phone),
    INDEX idx_role (role)
);

-- 2. PRODUCTS TABLE (Mahsulotlar)
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    description TEXT,
    price DECIMAL(12, 2) NOT NULL,
    daily_production INT DEFAULT 0,
    stock_quantity INT DEFAULT 0,
    raw_material_id UUID,
    unit VARCHAR(20) DEFAULT 'dona',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_active (is_active)
);

-- 3. RAW MATERIALS TABLE (Xom Ashyolar)
CREATE TABLE raw_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    quantity DECIMAL(10, 2) NOT NULL,
    unit VARCHAR(20) NOT NULL,
    price_per_unit DECIMAL(10, 2) NOT NULL,
    received_date DATE,
    last_used_date DATE,
    stock_balance DECIMAL(10, 2) NOT NULL,
    supplier_name VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_active (is_active)
);

-- 4. SALES TABLE (Sotuv)
CREATE TABLE sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(12, 2) NOT NULL,
    total_amount DECIMAL(12, 2) NOT NULL,
    customer_name VARCHAR(100),
    sale_date DATE DEFAULT CURRENT_DATE,
    status VARCHAR(50) DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'PARTIALLY_PAID')),
    payment_amount DECIMAL(12, 2) DEFAULT 0,
    discount_id UUID,
    notes TEXT,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_product (product_id),
    INDEX idx_date (sale_date),
    INDEX idx_status (status)
);

-- 5. EXPENSES TABLE (Xarajatlar)
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category VARCHAR(100) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    description TEXT,
    expense_date DATE DEFAULT CURRENT_DATE,
    receipt_file VARCHAR(255),
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_category (category),
    INDEX idx_date (expense_date)
);

-- 6. EMPLOYEES TABLE (Xodimlar)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    type VARCHAR(50) NOT NULL,
    daily_tariff DECIMAL(10, 2) NOT NULL,
    hourly_tariff DECIMAL(10, 2),
    hire_date DATE DEFAULT CURRENT_DATE,
    is_active BOOLEAN DEFAULT true,
    phone VARCHAR(20),
    address TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_active (is_active),
    INDEX idx_type (type)
);

-- 7. EMPLOYEE PRODUCTION TABLE (Xodim Ishlab Chiqarish)
CREATE TABLE employee_production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    production_date DATE NOT NULL,
    quantity_produced INT NOT NULL,
    daily_tariff DECIMAL(10, 2) NOT NULL,
    calculated_amount DECIMAL(12, 2) NOT NULL,
    month VARCHAR(7) NOT NULL,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, production_date),
    INDEX idx_employee (employee_id),
    INDEX idx_date (production_date),
    INDEX idx_month (month)
);

-- 8. SALARIES TABLE (Oylik)
CREATE TABLE salaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id),
    month VARCHAR(7) NOT NULL,
    total_calculated DECIMAL(12, 2) NOT NULL,
    bonuses DECIMAL(12, 2) DEFAULT 0,
    penalties DECIMAL(12, 2) DEFAULT 0,
    net_amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(50) DEFAULT 'CALCULATED' CHECK (status IN ('CALCULATED', 'APPROVED', 'PAID')),
    approved_by UUID REFERENCES users(id),
    paid_date DATE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(employee_id, month),
    INDEX idx_employee (employee_id),
    INDEX idx_month (month),
    INDEX idx_status (status)
);

-- 9. MACHINES TABLE (Mashinalar)
CREATE TABLE machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    status VARCHAR(50) DEFAULT 'WORKING' CHECK (status IN ('WORKING', 'BROKEN', 'SERVICE')),
    operator_id UUID REFERENCES employees(id),
    last_service_date DATE,
    next_service_date DATE,
    daily_production_capacity INT,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_name (name),
    INDEX idx_status (status),
    INDEX idx_active (is_active)
);

-- 10. DISCOUNTS TABLE (Chegirmalar)
CREATE TABLE discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    discount_type VARCHAR(50) NOT NULL CHECK (discount_type IN ('PERCENTAGE', 'FIXED')),
    discount_value DECIMAL(10, 2) NOT NULL,
    reason VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. AI ANALYSES TABLE (AI Tahlillar) - NEW
CREATE TABLE ai_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL CHECK (type IN ('SALARY_ANALYSIS', 'SALES_FORECAST', 'EXPENSE_OPTIMIZATION', 'PRODUCTION_REPORT', 'DASHBOARD_SUMMARY')),
    created_date DATE DEFAULT CURRENT_DATE,
    analysis_data JSONB NOT NULL,
    recommendations TEXT[],
    status VARCHAR(50) DEFAULT 'COMPLETED' CHECK (status IN ('COMPLETED', 'PROCESSING', 'ERROR')),
    processing_time INT,
    expire_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 hour'),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_date (created_date),
    INDEX idx_status (status)
);

-- 12. SMART ALERTS TABLE (Intellekt Bildirishnomalar) - NEW
CREATE TABLE smart_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(100) NOT NULL CHECK (type IN ('LOW_STOCK', 'ABSENCE', 'SALES_DROP', 'MAINTENANCE', 'HIGH_INVENTORY', 'EXPENSE_ALERT')),
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    message TEXT NOT NULL,
    triggered_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    dismissed_by UUID REFERENCES users(id),
    dismissed_at TIMESTAMP,
    action_taken TEXT,
    resolved_at TIMESTAMP,
    INDEX idx_type (type),
    INDEX idx_severity (severity),
    INDEX idx_dismissed (dismissed_by)
);

-- 13. AI CHAT HISTORY TABLE (Chat Tarix) - NEW
CREATE TABLE ai_chat_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id),
    question TEXT NOT NULL,
    answer TEXT NOT NULL,
    context_data JSONB,
    processing_time INT,
    is_helpful BOOLEAN,
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_date (created_at)
);

-- 14. AUDIT LOGS TABLE (Tarix)
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(50) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'LOGIN')),
    table_name VARCHAR(100),
    record_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user (user_id),
    INDEX idx_action (action),
    INDEX idx_timestamp (timestamp)
);

-- 15. SYSTEM SETTINGS TABLE (Tizim Sozlamalari)
CREATE TABLE system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- INDEXES VA CONSTRAINTS
-- ============================================

-- Foreign key constraints
ALTER TABLE products ADD CONSTRAINT fk_products_raw_materials
    FOREIGN KEY (raw_material_id) REFERENCES raw_materials(id);

ALTER TABLE sales ADD CONSTRAINT fk_sales_discount
    FOREIGN KEY (discount_id) REFERENCES discounts(id);

-- Create indexes for better query performance
CREATE INDEX idx_sales_customer ON sales(customer_name);
CREATE INDEX idx_expenses_created_by ON expenses(created_by);
CREATE INDEX idx_machines_operator ON machines(operator_id);
CREATE INDEX idx_salaries_approved_by ON salaries(approved_by);
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);

-- ============================================
-- VIEWS (Eslatmalar/Views)
-- ============================================

-- Monthly sales summary
CREATE VIEW monthly_sales_summary AS
SELECT 
    DATE_TRUNC('month', sale_date)::DATE as month,
    COUNT(*) as total_sales,
    SUM(quantity) as total_quantity,
    SUM(total_amount) as total_revenue
FROM sales
WHERE status IN ('PAID', 'PARTIALLY_PAID')
GROUP BY DATE_TRUNC('month', sale_date);

-- Employee salary summary
CREATE VIEW employee_salary_summary AS
SELECT 
    e.id,
    e.name,
    DATE_TRUNC('month', CURRENT_DATE)::DATE as month,
    SUM(ep.quantity_produced) as total_produced,
    SUM(ep.calculated_amount) as total_earned,
    (SELECT net_amount FROM salaries WHERE employee_id = e.id AND month = DATE_TRUNC('month', CURRENT_DATE)::VARCHAR) as net_salary
FROM employees e
LEFT JOIN employee_production ep ON e.id = ep.employee_id 
    AND ep.month = DATE_TRUNC('month', CURRENT_DATE)::VARCHAR
WHERE e.is_active = true
GROUP BY e.id, e.name;

-- Daily production summary
CREATE VIEW daily_production_summary AS
SELECT 
    production_date,
    COUNT(DISTINCT employee_id) as total_workers,
    SUM(quantity_produced) as total_production,
    AVG(calculated_amount) as avg_earning
FROM employee_production
GROUP BY production_date
ORDER BY production_date DESC;

-- ============================================
-- INITIAL DATA (Testlash uchun)
-- ============================================

-- Default system settings
INSERT INTO system_settings (key, value, description) VALUES
('company_name', 'TEKNOPLAST', 'Kompaniya nomi'),
('company_phone', '+998-XX-XXX-XX-XX', 'Telefon'),
('timezone', 'Asia/Tashkent', 'Vaqt mintaqasi'),
('currency', 'UZS', 'Valyuta'),
('language', 'uz', 'Til');
