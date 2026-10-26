-- employees schema（Postgres）。基线迁移：对已有数据的库是 no-op。
-- 由 drizzle-kit 生成 / 维护；`npm run migrate` 在部署前应用。
CREATE SCHEMA IF NOT EXISTS "employees";
--> statement-breakpoint
CREATE SEQUENCE IF NOT EXISTS "employees"."id_employee_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'employees' AND t.typname = 'employee_gender'
  ) THEN
    CREATE TYPE "employees"."employee_gender" AS ENUM('M', 'F');
  END IF;
END
$$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees"."employee" (
	"id" bigint DEFAULT nextval('employees.id_employee_seq') NOT NULL,
	"birth_date" date NOT NULL,
	"first_name" varchar(14) NOT NULL,
	"last_name" varchar(16) NOT NULL,
	"gender" "employees"."employee_gender" NOT NULL,
	"hire_date" date NOT NULL,
	CONSTRAINT "idx_16988_primary" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees"."department" (
	"id" char(4) NOT NULL,
	"dept_name" varchar(40) NOT NULL,
	CONSTRAINT "idx_16979_primary" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_16979_dept_name" ON "employees"."department" USING btree ("dept_name");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees"."department_employee" (
	"employee_id" bigint NOT NULL,
	"department_id" char(4) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	CONSTRAINT "idx_16982_primary" PRIMARY KEY("employee_id","department_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_16982_dept_no" ON "employees"."department_employee" USING btree ("department_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees"."department_manager" (
	"employee_id" bigint NOT NULL,
	"department_id" char(4) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	CONSTRAINT "idx_16985_primary" PRIMARY KEY("employee_id","department_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_16985_dept_no" ON "employees"."department_manager" USING btree ("department_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees"."salary" (
	"employee_id" bigint NOT NULL,
	"amount" bigint NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	CONSTRAINT "idx_16991_primary" PRIMARY KEY("employee_id","from_date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "employees"."title" (
	"employee_id" bigint NOT NULL,
	"title" varchar(50) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	CONSTRAINT "idx_16994_primary" PRIMARY KEY("employee_id","title","from_date")
);
--> statement-breakpoint
ALTER TABLE "employees"."employee" ALTER COLUMN "id" SET DEFAULT nextval('employees.id_employee_seq');
--> statement-breakpoint
ALTER SEQUENCE "employees"."id_employee_seq" OWNED BY "employees"."employee"."id";
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dept_emp_ibfk_1' AND connamespace = 'employees'::regnamespace) THEN
    ALTER TABLE "employees"."department_employee"
      ADD CONSTRAINT "dept_emp_ibfk_1" FOREIGN KEY ("employee_id")
      REFERENCES "employees"."employee"("id") ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dept_emp_ibfk_2' AND connamespace = 'employees'::regnamespace) THEN
    ALTER TABLE "employees"."department_employee"
      ADD CONSTRAINT "dept_emp_ibfk_2" FOREIGN KEY ("department_id")
      REFERENCES "employees"."department"("id") ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dept_manager_ibfk_1' AND connamespace = 'employees'::regnamespace) THEN
    ALTER TABLE "employees"."department_manager"
      ADD CONSTRAINT "dept_manager_ibfk_1" FOREIGN KEY ("employee_id")
      REFERENCES "employees"."employee"("id") ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dept_manager_ibfk_2' AND connamespace = 'employees'::regnamespace) THEN
    ALTER TABLE "employees"."department_manager"
      ADD CONSTRAINT "dept_manager_ibfk_2" FOREIGN KEY ("department_id")
      REFERENCES "employees"."department"("id") ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'salaries_ibfk_1' AND connamespace = 'employees'::regnamespace) THEN
    ALTER TABLE "employees"."salary"
      ADD CONSTRAINT "salaries_ibfk_1" FOREIGN KEY ("employee_id")
      REFERENCES "employees"."employee"("id") ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'titles_ibfk_1' AND connamespace = 'employees'::regnamespace) THEN
    ALTER TABLE "employees"."title"
      ADD CONSTRAINT "titles_ibfk_1" FOREIGN KEY ("employee_id")
      REFERENCES "employees"."employee"("id") ON UPDATE RESTRICT ON DELETE CASCADE;
  END IF;
END
$$;
