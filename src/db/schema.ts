/**
 * Neon 上 `employees` schema 的 Drizzle 定义 —— 迁移与查询的唯一事实来源。
 *
 * 这份定义逐项对齐原始数据集导入后的实际结构（列类型、varchar 长度、
 * `employee_gender` 枚举、`id_employee_seq` 序列、主键/外键/索引名），
 * 所以 `drizzle-kit generate` 对已有库生成的是空 diff。
 *
 * 约定：
 *   * `to_date = '9999-01-01'` 表示“当前仍然有效”。
 *   * `employee.id` 由独立序列 `employees.id_employee_seq` 提供默认值。
 */

import { relations, sql } from 'drizzle-orm'
import {
  bigint,
  char,
  date,
  foreignKey,
  index,
  pgSchema,
  primaryKey,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core'

export const employees = pgSchema('employees')

/** 原始数据集里的 `employees.employee_gender`（ENUM 'M' | 'F'）。 */
export const employeeGender = employees.enum('employee_gender', ['M', 'F'])

/** `employee.id` 的默认值来源，与原数据集同名。 */
export const idEmployeeSeq = employees.sequence('id_employee_seq')

export const employee = employees.table(
  'employee',
  {
    id: bigint('id', { mode: 'number' })
      .notNull()
      .default(sql`nextval('employees.id_employee_seq')`),
    birthDate: date('birth_date').notNull(),
    firstName: varchar('first_name', { length: 14 }).notNull(),
    lastName: varchar('last_name', { length: 16 }).notNull(),
    gender: employeeGender('gender').notNull(),
    hireDate: date('hire_date').notNull(),
  },
  (table) => [primaryKey({ name: 'idx_16988_primary', columns: [table.id] })],
)

export const department = employees.table(
  'department',
  {
    id: char('id', { length: 4 }).notNull(),
    deptName: varchar('dept_name', { length: 40 }).notNull(),
  },
  (table) => [
    primaryKey({ name: 'idx_16979_primary', columns: [table.id] }),
    uniqueIndex('idx_16979_dept_name').on(table.deptName),
  ],
)

export const departmentEmployee = employees.table(
  'department_employee',
  {
    employeeId: bigint('employee_id', { mode: 'number' }).notNull(),
    departmentId: char('department_id', { length: 4 }).notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'idx_16982_primary',
      columns: [table.employeeId, table.departmentId],
    }),
    index('idx_16982_dept_no').on(table.departmentId),
    // 原数据集的外键名（由 MySQL 迁移脚本沿用下来）。
    foreignKey({
      name: 'dept_emp_ibfk_1',
      columns: [table.employeeId],
      foreignColumns: [employee.id],
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      name: 'dept_emp_ibfk_2',
      columns: [table.departmentId],
      foreignColumns: [department.id],
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
  ],
)

export const departmentManager = employees.table(
  'department_manager',
  {
    employeeId: bigint('employee_id', { mode: 'number' }).notNull(),
    departmentId: char('department_id', { length: 4 }).notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'idx_16985_primary',
      columns: [table.employeeId, table.departmentId],
    }),
    index('idx_16985_dept_no').on(table.departmentId),
    foreignKey({
      name: 'dept_manager_ibfk_1',
      columns: [table.employeeId],
      foreignColumns: [employee.id],
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
    foreignKey({
      name: 'dept_manager_ibfk_2',
      columns: [table.departmentId],
      foreignColumns: [department.id],
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
  ],
)

export const salary = employees.table(
  'salary',
  {
    employeeId: bigint('employee_id', { mode: 'number' }).notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    fromDate: date('from_date').notNull(),
    toDate: date('to_date').notNull(),
  },
  (table) => [
    primaryKey({
      name: 'idx_16991_primary',
      columns: [table.employeeId, table.fromDate],
    }),
    foreignKey({
      name: 'salaries_ibfk_1',
      columns: [table.employeeId],
      foreignColumns: [employee.id],
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
  ],
)

export const title = employees.table(
  'title',
  {
    employeeId: bigint('employee_id', { mode: 'number' }).notNull(),
    title: varchar('title', { length: 50 }).notNull(),
    fromDate: date('from_date').notNull(),
    // 这套结构里唯一可空的列。
    toDate: date('to_date'),
  },
  (table) => [
    primaryKey({
      name: 'idx_16994_primary',
      columns: [table.employeeId, table.title, table.fromDate],
    }),
    foreignKey({
      name: 'titles_ibfk_1',
      columns: [table.employeeId],
      foreignColumns: [employee.id],
    })
      .onUpdate('restrict')
      .onDelete('cascade'),
  ],
)

/* ------------------------------------------------------------------ */
/* 关系（给 db.query.* 用）                                            */
/* ------------------------------------------------------------------ */

export const employeeRelations = relations(employee, ({ many }) => ({
  salaries: many(salary),
  titles: many(title),
  departments: many(departmentEmployee),
  managedDepartments: many(departmentManager),
}))

export const departmentRelations = relations(department, ({ many }) => ({
  employees: many(departmentEmployee),
  managers: many(departmentManager),
}))

export const salaryRelations = relations(salary, ({ one }) => ({
  employee: one(employee, {
    fields: [salary.employeeId],
    references: [employee.id],
  }),
}))

export const titleRelations = relations(title, ({ one }) => ({
  employee: one(employee, {
    fields: [title.employeeId],
    references: [employee.id],
  }),
}))

export const departmentEmployeeRelations = relations(departmentEmployee, ({ one }) => ({
  employee: one(employee, {
    fields: [departmentEmployee.employeeId],
    references: [employee.id],
  }),
  department: one(department, {
    fields: [departmentEmployee.departmentId],
    references: [department.id],
  }),
}))

export const departmentManagerRelations = relations(departmentManager, ({ one }) => ({
  employee: one(employee, {
    fields: [departmentManager.employeeId],
    references: [employee.id],
  }),
  department: one(department, {
    fields: [departmentManager.departmentId],
    references: [department.id],
  }),
}))
