import customtkinter as ctk
import sqlite3
import pandas as pd
from tkinter import ttk, messagebox, simpledialog
import os
from PIL import Image
from datetime import datetime
import threading
import time
import json
import traceback
import sys
import socket

try:
    import pymysql
    mysql_lib = pymysql
except ImportError:
    import mysql.connector
    mysql_lib = mysql.connector

if getattr(sys, 'frozen', False):
    BASE_DIR = os.path.dirname(sys.executable)
    MEI_DIR = sys._MEIPASS
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    MEI_DIR = BASE_DIR

DB_PATH = os.path.join(BASE_DIR, 'fratelanza_erp.db')
LOGO_PATH = os.path.join(MEI_DIR, "logo.png")
FONT_PATH = os.path.join(MEI_DIR, "arial.ttf")

def global_exception_handler(exc_type, exc_value, exc_traceback):
    err_msg = "".join(traceback.format_exception(exc_type, exc_value, exc_traceback))
    crash_file = os.path.join(BASE_DIR, "FATAL_CRASH.txt")
    with open(crash_file, "a", encoding="utf-8") as f:
        f.write(f"\n[{datetime.now()}] CRASH REPORT:\n{err_msg}\n")
    try:
        import tkinter as tk
        root = tk.Tk()
        root.withdraw()
        messagebox.showerror("Critical System Error", f"The application crashed!\nA log file has been saved to:\n{crash_file}\n\nError: {exc_value}")
    except: pass
    sys.exit(1)

sys.excepthook = global_exception_handler

try:
    from fpdf import FPDF
    from tkcalendar import DateEntry
    import matplotlib.pyplot as plt
    from matplotlib.backends.backend_tkagg import FigureCanvasTkAgg
    import arabic_reshaper
    from bidi.algorithm import get_display
    HAS_EXTRA_LIBS = True
except ImportError:
    HAS_EXTRA_LIBS = False
    print("Warning: Missing libraries.")

ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

class FratelanzaERP(ctk.CTk):
    def __init__(self):
        super().__init__()
        
        self.master_password = "admin123" 
        self.tax_id = "779-103-211" 
        
        self.privacy_mode = True
        self.eye_buttons = []
        self.editing_quote_id = None
        self.editing_soft_id = None
        
        self.title("Fratelanza ERP - Global Financial System")
        self.overrideredirect(True) 
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        self.geometry(f"{screen_width}x{screen_height}+0+0")
        self.configure(fg_color="#0a192f")

        self.init_database()
        self.setup_table_styles() 
        self.vcmd_num = (self.register(self.validate_numbers_only), '%P')

        self.splash_frame = ctk.CTkFrame(self, fg_color="transparent")
        self.splash_frame.pack(expand=True, fill="both")

        try:
            logo_img = ctk.CTkImage(light_image=Image.open(LOGO_PATH), dark_image=Image.open(LOGO_PATH), size=(800, 450))
            self.logo_label = ctk.CTkLabel(self.splash_frame, image=logo_img, text="")
            self.logo_label.pack(pady=(int(screen_height*0.15), 10))
        except:
            self.logo_label = ctk.CTkLabel(self.splash_frame, text="Fratelanza ERP", font=("Arial", 80, "bold"), text_color="#00BFFF")
            self.logo_label.pack(pady=(int(screen_height*0.3), 10))

        self.slogan_label = ctk.CTkLabel(self.splash_frame, text="Building Tomorrow Together", font=("Arial", 32, "bold"), text_color="#e6f1ff")
        self.slogan_label.pack(pady=20)

        self.after(3000, self.safe_show_main_app)

    def safe_show_main_app(self):
        try: self.show_main_app()
        except Exception as e: global_exception_handler(*sys.exc_info())

    def verify_action_with_password(self, action_callback):
        dialog = ctk.CTkToplevel(self)
        dialog.title("Security Check")
        dialog.geometry("450x250")
        dialog.configure(fg_color="#0f172a")
        dialog.transient(self)
        dialog.grab_set() 
        
        screen_width = self.winfo_screenwidth()
        screen_height = self.winfo_screenheight()
        dialog.geometry(f'+{int((screen_width / 2) - 225)}+{int((screen_height / 2) - 125)}')

        ctk.CTkLabel(dialog, text="🔒 Authentication Required", font=("Arial", 24, "bold"), text_color="#00BFFF").pack(pady=(25, 10))
        ctk.CTkLabel(dialog, text="Please enter Master Password:", font=("Arial", 15), text_color="white").pack(pady=5)
        pwd_entry = ctk.CTkEntry(dialog, show="●", font=("Arial", 20, "bold"), width=220, justify="center"); pwd_entry.pack(pady=15); pwd_entry.focus()

        def verify(event=None):
            if pwd_entry.get() == self.master_password: 
                dialog.destroy()
                action_callback()
            else: 
                messagebox.showerror("Access Denied", "Incorrect Password!", parent=dialog)
                pwd_entry.delete(0, 'end')

        btn_frame = ctk.CTkFrame(dialog, fg_color="transparent"); btn_frame.pack(pady=10)
        ctk.CTkButton(btn_frame, text="Confirm ✔", font=("Arial", 16, "bold"), fg_color="#dc3545", hover_color="#c82333", command=verify, width=110).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="Cancel ✖", font=("Arial", 16, "bold"), fg_color="gray", command=dialog.destroy, width=110).pack(side="left", padx=10)
        dialog.bind('<Return>', verify)

    def toggle_privacy(self):
        if self.privacy_mode:
            def unlock():
                self.privacy_mode = False
                self.apply_privacy_state()
            self.verify_action_with_password(unlock)
        else:
            self.privacy_mode = True
            self.apply_privacy_state()

    def apply_privacy_state(self):
        show_char = "*" if self.privacy_mode else ""
        eye_text = "👁️" if self.privacy_mode else "🔓"

        for btn in getattr(self, 'eye_buttons', []):
            try: btn.configure(text=eye_text)
            except: pass

        entries_to_mask = []
        if hasattr(self, 'soft_price_entry'): entries_to_mask.extend([getattr(self, 'soft_price_entry', None), getattr(self, 'soft_exp_entry', None), getattr(self, 'soft_brok_entry', None), getattr(self, 'soft_paid_entry', None)])
        if hasattr(self, 'tr_trainee_cost_entry'): entries_to_mask.extend([self.tr_trainee_cost_entry, self.tr_exp_entry, self.tr_inst_pct_entry])
        if hasattr(self, 'srv_cost'): entries_to_mask.extend([self.srv_cost, self.srv_exp, self.srv_mult, self.srv_brok])
        if hasattr(self, 'free_entries'):
            if "Total Earned:" in self.free_entries: entries_to_mask.append(self.free_entries["Total Earned:"])
            if "Remaining Balance:" in self.free_entries: entries_to_mask.append(self.free_entries["Remaining Balance:"])

        for e in entries_to_mask:
            if e: e.configure(show=show_char)

        if hasattr(self, 'calculate_software'): self.calculate_software()
        if hasattr(self, 'calculate_training'): self.calculate_training()
        if hasattr(self, 'load_freelancers'): self.load_freelancers()
        if hasattr(self, 'load_services'): self.load_services()
        if hasattr(self, 'load_reports'): self.load_reports()
        if hasattr(self, 'refresh_finance_data'): self.refresh_finance_data(use_dates=False)
        if hasattr(self, 'refresh_dashboard'): self.refresh_dashboard()
        if hasattr(self, 'load_receivables'): self.load_receivables()
        if hasattr(self, 'load_software_projects'): self.load_software_projects()

    def format_money(self, val):
        if self.privacy_mode: return "***"
        return self.format_num(val)

    def validate_numbers_only(self, P):
        if P == "" or P.replace('.', '', 1).replace(',', '', 1).isdigit(): return True
        return False

    def format_num(self, val):
        try:
            v = float(val); return f"{int(v):,}" if v.is_integer() else f"{v:,.2f}"
        except: return str(val)

    def apply_live_format(self, entry_widget):
        def on_key(event):
            if event.keysym in ['Left', 'Right', 'Up', 'Down', 'BackSpace', 'Delete']: return
            val = entry_widget.get().replace(',', '')
            if not val: return
            try:
                formatted = f"{int(val.split('.')[0]):,}.{val.split('.')[1]}" if '.' in val else f"{int(val):,}" if val != '-' else val
                if entry_widget.get() != formatted and not self.privacy_mode:
                    cursor = entry_widget.index("insert"); old_len = len(entry_widget.get())
                    entry_widget.delete(0, 'end'); entry_widget.insert(0, formatted)
                    entry_widget.icursor(cursor + (len(formatted) - old_len))
            except: pass
        entry_widget.bind('<KeyRelease>', on_key)

    def treeview_sort_column(self, tv, col, reverse):
        l = [(tv.set(k, col), k) for k in tv.get_children('')]
        def parse_val(val):
            v = str(val).replace(',', '').replace(' EGP', '').replace(' ج.م', '').replace('⭐', '').strip()
            if v == "***": return -1.0
            try: return float(v)
            except ValueError: return val.lower()
        l.sort(key=lambda t: parse_val(t[0]), reverse=reverse)
        for index, (val, k) in enumerate(l): tv.move(k, '', index)
        tv.heading(col, command=lambda: self.treeview_sort_column(tv, col, not reverse))

    def make_treeview_sortable(self, tv):
        for col in tv['columns']:
            tv.heading(col, text=col, command=lambda _col=col: self.treeview_sort_column(tv, _col, False))

    def init_database(self):
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            cursor = conn.cursor()
            cursor.execute('''CREATE TABLE IF NOT EXISTS sync_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, query TEXT, params TEXT, status TEXT DEFAULT 'Pending')''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS pricing_records (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT, project_name TEXT, client_price REAL, total_cost REAL, net_profit REAL, freelancer_name TEXT DEFAULT '', freelancer_commission REAL DEFAULT 0, date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS freelancers (code TEXT PRIMARY KEY, name TEXT, phone TEXT, spec TEXT, position TEXT, earned REAL, balance REAL)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS general_expenses (id INTEGER PRIMARY KEY AUTOINCREMENT, description TEXT, amount REAL, date TEXT)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS clients (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, phone TEXT, address TEXT, activity TEXT, project TEXT)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS templates (id INTEGER PRIMARY KEY AUTOINCREMENT, category TEXT, name TEXT UNIQUE, cost REAL, expenses REAL, multiplier REAL, broker REAL, students INTEGER)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS sales_quotes (id INTEGER PRIMARY KEY AUTOINCREMENT, client_name TEXT, project_name TEXT, price REAL, language TEXT, date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
            cursor.execute('''CREATE TABLE IF NOT EXISTS project_team (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id INTEGER, freelancer_name TEXT, commission REAL)''')
            
            try: cursor.execute("ALTER TABLE freelancers ADD COLUMN rating REAL DEFAULT 5.0")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN start_date TEXT")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN deadline TEXT")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN status TEXT DEFAULT 'Ongoing'")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN client_name TEXT DEFAULT ''")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN paid_amount REAL DEFAULT 0")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN remaining_amount REAL DEFAULT 0")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN next_payment_date TEXT")
            except: pass
            try: cursor.execute("ALTER TABLE pricing_records ADD COLUMN notes TEXT DEFAULT ''")
            except: pass
            try: cursor.execute("ALTER TABLE clients ADD COLUMN notes TEXT DEFAULT ''")
            except: pass
            
            cursor.execute("SELECT COUNT(*) FROM templates")
            if cursor.fetchone()[0] == 0:
                defaults = [("Software", "Web App (Static)", 15000, 500, 1.0, 10, 0), ("Software", "E-Commerce System", 35000, 2000, 1.0, 15, 0), ("Training", "Data Analysis Course", 2000, 2000, 30.0, 0, 15)]
                cursor.executemany("INSERT INTO templates (category, name, cost, expenses, multiplier, broker, students) VALUES (?, ?, ?, ?, ?, ?, ?)", defaults)
            conn.commit()
        finally: conn.close()

    def execute_local_and_queue_sync(self, sqlite_query, params=()):
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            cursor = conn.cursor()
            cursor.execute(sqlite_query, params)
            mysql_query = sqlite_query.replace('?', '%s')
            cursor.execute("INSERT INTO sync_queue (query, params) VALUES (?, ?)", (mysql_query, json.dumps(params)))
            conn.commit()
            return cursor.lastrowid
        except Exception as e: 
            print(f"Local DB Error: {e}")
            return None
        finally: conn.close()

    def get_server_connection(self):
        try:
            socket.create_connection(("187.124.15.14", 3306), timeout=2).close()
        except OSError: return None
        try: return mysql_lib.connect(host="187.124.15.14", user="ahmedrefaat", password="M_ahmed2015", database="fratelanza_erp", connect_timeout=3)
        except Exception: return None

    def log_sync_msg(self, msg, color="#00BFFF"):
        print(f"Sync Log: {msg}")
        def safe_update():
            try:
                if hasattr(self, 'sync_log_text'):
                    self.sync_log_text.insert("end", f"[{datetime.now().strftime('%H:%M:%S')}] {msg}\n")
                    self.sync_log_text.see("end")
            except: pass
        self.after(0, safe_update)

    def ensure_remote_tables_exist(self):
        server_conn = self.get_server_connection()
        if server_conn:
            try:
                sc = server_conn.cursor()
                sc.execute('''CREATE TABLE IF NOT EXISTS sales_quotes (id INT AUTO_INCREMENT PRIMARY KEY, client_name VARCHAR(255), project_name TEXT, price DOUBLE, language VARCHAR(50), date TIMESTAMP DEFAULT CURRENT_TIMESTAMP)''')
                sc.execute('''CREATE TABLE IF NOT EXISTS project_team (id INT AUTO_INCREMENT PRIMARY KEY, project_id INT, freelancer_name VARCHAR(255), commission DOUBLE)''')
                try: sc.execute("ALTER TABLE freelancers ADD COLUMN rating DOUBLE DEFAULT 5.0")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN start_date VARCHAR(50)")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN deadline VARCHAR(50)")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN status VARCHAR(50) DEFAULT 'Ongoing'")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN client_name VARCHAR(255) DEFAULT ''")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN paid_amount DOUBLE DEFAULT 0")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN remaining_amount DOUBLE DEFAULT 0")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN next_payment_date VARCHAR(50)")
                except: pass
                try: sc.execute("ALTER TABLE pricing_records ADD COLUMN notes TEXT DEFAULT ''")
                except: pass
                try: sc.execute("ALTER TABLE clients ADD COLUMN notes TEXT DEFAULT ''")
                except: pass
                server_conn.commit()
            except Exception: pass
            finally: server_conn.close()

    def start_sync_thread(self):
        threading.Thread(target=self.sync_background_loop_protected, daemon=True).start()

    def sync_background_loop_protected(self):
        try:
            self.ensure_remote_tables_exist()
            self.download_initial_data() 
            while True: self.sync_local_to_server(); time.sleep(5) 
        except Exception as e: pass

    def download_initial_data(self):
        try:
            local_conn = sqlite3.connect(DB_PATH, timeout=20)
            cursor = local_conn.cursor()
            cursor.execute("SELECT COUNT(*) FROM general_expenses")
            if cursor.fetchone()[0] == 0:
                server_conn = self.get_server_connection()
                if server_conn:
                    s_cursor = server_conn.cursor()
                    s_cursor.execute("SELECT id, description, amount, date FROM general_expenses")
                    rows = s_cursor.fetchall()
                    if rows: cursor.executemany("INSERT OR IGNORE INTO general_expenses (id, description, amount, date) VALUES (?, ?, ?, ?)", rows)
                    
                    try:
                        s_cursor.execute("SELECT id, type, project_name, client_price, total_cost, net_profit, freelancer_name, freelancer_commission, date, start_date, deadline, status, client_name, paid_amount, remaining_amount, next_payment_date, notes FROM pricing_records")
                        rows = s_cursor.fetchall()
                        if rows: cursor.executemany("INSERT OR IGNORE INTO pricing_records (id, type, project_name, client_price, total_cost, net_profit, freelancer_name, freelancer_commission, date, start_date, deadline, status, client_name, paid_amount, remaining_amount, next_payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
                    except: pass
                    
                    try:
                        s_cursor.execute("SELECT id, project_id, freelancer_name, commission FROM project_team")
                        rows = s_cursor.fetchall()
                        if rows: cursor.executemany("INSERT OR IGNORE INTO project_team (id, project_id, freelancer_name, commission) VALUES (?, ?, ?, ?)", rows)
                    except: pass

                    try:
                        s_cursor.execute("SELECT code, name, phone, spec, position, earned, balance, rating FROM freelancers")
                        rows = s_cursor.fetchall()
                        if rows: cursor.execute("DELETE FROM freelancers"); cursor.executemany("INSERT INTO freelancers VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
                    except: pass
                        
                    try:
                        s_cursor.execute("SELECT id, client_name, project_name, price, language, date FROM sales_quotes")
                        rows = s_cursor.fetchall()
                        if rows: cursor.executemany("INSERT OR IGNORE INTO sales_quotes (id, client_name, project_name, price, language, date) VALUES (?, ?, ?, ?, ?, ?)", rows)
                    except: pass
                    local_conn.commit()
                    server_conn.close()
            local_conn.close()
        except Exception: pass

    def sync_local_to_server(self):
        try:
            local_conn = sqlite3.connect(DB_PATH, timeout=20)
            local_cursor = local_conn.cursor()
            local_cursor.execute("SELECT id, query, params FROM sync_queue ORDER BY id ASC")
            records = local_cursor.fetchall()
            if not records: local_conn.close(); return 
                
            server_conn = self.get_server_connection()
            if not server_conn: local_conn.close(); return 
                
            server_cursor = server_conn.cursor()
            for r_id, query, params_json in records:
                params = json.loads(params_json)
                params = tuple(params) if isinstance(params, list) else params
                try:
                    server_cursor.execute(query, params)
                    local_cursor.execute("DELETE FROM sync_queue WHERE id = ?", (r_id,))
                except Exception: pass
            server_conn.commit(); local_conn.commit(); server_conn.close(); local_conn.close()
        except Exception: pass

    def pull_all_from_server(self):
        self.sync_local_to_server()

        server_conn = self.get_server_connection()
        if not server_conn:
            messagebox.showerror("Error", "لا يمكن الاتصال بالسيرفر الآن، يرجى التأكد من الإنترنت.")
            return
            
        try:
            local_conn = sqlite3.connect(DB_PATH, timeout=20)
            l_cursor = local_conn.cursor()
            s_cursor = server_conn.cursor()

            try:
                s_cursor.execute("SELECT code, name, phone, spec, position, earned, balance, rating FROM freelancers")
                rows = s_cursor.fetchall()
                if rows:
                    l_cursor.execute("DELETE FROM freelancers")
                    l_cursor.executemany("INSERT INTO freelancers VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
            except Exception as e: print("Sync Free Error:", e)

            try:
                s_cursor.execute("SELECT id, description, amount, date FROM general_expenses")
                rows = s_cursor.fetchall()
                if rows:
                    l_cursor.execute("DELETE FROM general_expenses")
                    l_cursor.executemany("INSERT INTO general_expenses (id, description, amount, date) VALUES (?, ?, ?, ?)", rows)
            except Exception as e: print("Sync Exp Error:", e)
           
            try:
                s_cursor.execute("SELECT id, type, project_name, client_price, total_cost, net_profit, freelancer_name, freelancer_commission, date, start_date, deadline, status, client_name, paid_amount, remaining_amount, next_payment_date, notes FROM pricing_records")
                rows = s_cursor.fetchall()
                if rows:
                    l_cursor.execute("DELETE FROM pricing_records")
                    l_cursor.executemany("INSERT INTO pricing_records (id, type, project_name, client_price, total_cost, net_profit, freelancer_name, freelancer_commission, date, start_date, deadline, status, client_name, paid_amount, remaining_amount, next_payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", rows)
            except Exception as e: 
                print("Error Syncing Pricing Records:", e)
                
            try:
                s_cursor.execute("SELECT id, project_id, freelancer_name, commission FROM project_team")
                rows = s_cursor.fetchall()
                if rows:
                    l_cursor.execute("DELETE FROM project_team")
                    l_cursor.executemany("INSERT INTO project_team (id, project_id, freelancer_name, commission) VALUES (?, ?, ?, ?)", rows)
            except Exception as e: print("Sync Team Error:", e)

            try:
                s_cursor.execute("SELECT id, name, phone, address, activity, project, notes FROM clients")
                rows = s_cursor.fetchall()
                if rows:
                    l_cursor.execute("DELETE FROM clients")
                    l_cursor.executemany("INSERT INTO clients (id, name, phone, address, activity, project, notes) VALUES (?, ?, ?, ?, ?, ?, ?)", rows)
            except Exception as e: print("Sync Clients Error:", e)

            try:
                s_cursor.execute("SELECT id, category, name, cost, expenses, multiplier, broker, students FROM templates")
                rows = s_cursor.fetchall()
                if rows:
                    l_cursor.execute("DELETE FROM templates")
                    l_cursor.executemany("INSERT INTO templates (id, category, name, cost, expenses, multiplier, broker, students) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", rows)
            except Exception as e: print("Sync Temp Error:", e)

            local_conn.commit()
            local_conn.close()

            self.refresh_all_dropdowns()
            if hasattr(self, 'refresh_dashboard'): self.refresh_dashboard()
            if hasattr(self, 'load_freelancers'): self.load_freelancers()
            if hasattr(self, 'load_services'): self.load_services()
            if hasattr(self, 'load_reports'): self.load_reports()
            if hasattr(self, 'refresh_finance_data'): self.refresh_finance_data(use_dates=False)
            if hasattr(self, 'load_tasks'): self.load_tasks()
            if hasattr(self, 'load_clients'): self.load_clients()
            if hasattr(self, 'load_quotes'): self.load_quotes()
            if hasattr(self, 'load_receivables'): self.load_receivables()
            if hasattr(self, 'load_software_projects'): self.load_software_projects()

            messagebox.showinfo("Success", "✅ تم مزامنة وسحب جميع البيانات من السيرفر وتحديث البرنامج بالكامل بنجاح!")
        except Exception as e:
            messagebox.showerror("Sync Error", f"حدث خطأ أثناء السحب الشامل: {e}")
        finally:
            server_conn.close()

    def setup_table_styles(self):
        style = ttk.Style()
        style.theme_use("default")
        style.configure("Treeview", background="#1e293b", foreground="white", rowheight=35, fieldbackground="#1e293b", font=("Arial", 14, "bold")) 
        style.configure("Treeview.Heading", background="#00BFFF", foreground="black", font=("Arial", 15, "bold")) 
        style.map('Treeview', background=[('selected', '#1f6aa5')])

    def show_main_app(self):
        self.splash_frame.destroy()
        self.overrideredirect(False)
        try: self.state('zoomed')
        except: self.attributes('-zoomed', True)
        self.start_sync_thread()
        self.build_main_ui()
        self.after(2000, self.check_payment_alerts)

    def check_payment_alerts(self):
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            cursor = conn.cursor()
            today = datetime.now().strftime('%Y-%m-%d')
            cursor.execute("SELECT project_name, client_name, remaining_amount, next_payment_date FROM pricing_records WHERE remaining_amount > 0 AND next_payment_date <= ? AND next_payment_date != ''", (today,))
            due_payments = cursor.fetchall()
            if due_payments:
                msg = "⚠️ تنبيه مدفوعات مستحقة اليوم أو متأخرة:\n\n"
                for p in due_payments:
                    msg += f"- مشروع: {p[0]} | العميل: {p[1]}\n  المتبقي: {self.format_num(p[2])} ج.م | ميعاد الدفع: {p[3]}\n\n"
                messagebox.showwarning("تذكير بالمدفوعات (Payment Alerts)", msg)
        except Exception: pass
        finally: conn.close()

    def open_global_notes(self):
        notes_win = ctk.CTkToplevel(self)
        notes_win.title("📝 Global Quick Notes")
        notes_win.geometry("600x500")
        notes_win.transient(self)
        notes_win.configure(fg_color="#0f172a")

        ctk.CTkLabel(notes_win, text="ملاحظات سريعة عامة (Global Notes)", font=("Arial", 20, "bold"), text_color="#00BFFF").pack(pady=10)
        
        textbox = ctk.CTkTextbox(notes_win, font=("Arial", 16), width=550, height=380)
        textbox.pack(pady=10, padx=20)
        
        notes_file = os.path.join(BASE_DIR, "global_notes.txt")
        if os.path.exists(notes_file):
            with open(notes_file, "r", encoding="utf-8") as f:
                textbox.insert("1.0", f.read())

        def save_notes():
            with open(notes_file, "w", encoding="utf-8") as f:
                f.write(textbox.get("1.0", "end-1c"))
            messagebox.showinfo("Success", "تم حفظ الملاحظات بنجاح!", parent=notes_win)
            notes_win.destroy()

        ctk.CTkButton(notes_win, text="💾 حفظ الملاحظات", font=("Arial", 16, "bold"), fg_color="#28a745", hover_color="#218838", command=save_notes).pack(pady=10)

    def load_dynamic_templates(self):
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            cursor = conn.cursor()
            self.software_projects = {}
            cursor.execute("SELECT name, cost, expenses, broker FROM templates WHERE category='Software'")
            for row in cursor.fetchall(): self.software_projects[row[0]] = {"price": row[1], "expenses": row[2], "broker": row[3]}

            self.training_projects = {}
            cursor.execute("SELECT name, cost, expenses, multiplier, students FROM templates WHERE category='Training'")
            for row in cursor.fetchall(): self.training_projects[row[0]] = {"trainee_cost": row[1], "expenses": row[2], "inst_pct": row[3], "students": row[4]}

            self.all_project_names = list(self.software_projects.keys()) + list(self.training_projects.keys())
            
            cursor.execute("SELECT name FROM freelancers ORDER BY rating DESC, earned DESC")
            self.freelancers_list = ["-- Select Freelancer/Instructor --"] + [row[0] for row in cursor.fetchall()]
            
            self.client_names_list = [row[0] for row in cursor.execute("SELECT name FROM clients").fetchall()]
            
            db_specs = [row[0] for row in cursor.execute("SELECT DISTINCT spec FROM freelancers WHERE spec != ''").fetchall()]
            global_groups = [
                "Development | Frontend", "Development | Backend", "Development | Full Stack", "Development | Mobile App",
                "Data | Data Analyst", "Data | Data Scientist", "Data | Data Engineer",
                "Design | UI/UX", "Design | Graphic Designer", "Design | Video Editor", "Design | 3D Animator",
                "Marketing | Digital Marketer", "Marketing | SEO Specialist", "Marketing | Content Creator",
                "Business | Project Manager", "Business | Business Analyst"
            ]
            self.combined_specs = list(set(global_groups + db_specs))
            self.combined_specs.sort(); self.combined_specs.append("Custom...")
        finally: conn.close()

    def build_main_ui(self):
        self.load_dynamic_templates() 
        top_frame = ctk.CTkFrame(self, fg_color="transparent")
        top_frame.pack(fill="x", padx=20, pady=10)
        ctk.CTkLabel(top_frame, text="Fratelanza ERP - Global Operations", font=("Arial", 32, "bold"), text_color="#00BFFF").pack(side="left")
        
        ctk.CTkButton(top_frame, text="Exit App ✖", font=("Arial", 18, "bold"), fg_color="#dc3545", hover_color="#c82333", width=120, height=40, command=self.destroy).pack(side="right", padx=10)
        ctk.CTkButton(top_frame, text="📝 Global Notes", font=("Arial", 16, "bold"), fg_color="#ffc107", hover_color="#e0a800", text_color="black", height=40, command=self.open_global_notes).pack(side="right", padx=10)
        ctk.CTkButton(top_frame, text="🔄 مزامنة شاملة", font=("Arial", 16, "bold"), fg_color="#17a2b8", hover_color="#138496", height=40, command=self.pull_all_from_server).pack(side="right", padx=10)

        self.tabview = ctk.CTkTabview(self)
        self.tabview.pack(padx=20, pady=10, fill="both", expand=True)
        self.tabview._segmented_button.configure(font=("Arial", 16, "bold"))

        if HAS_EXTRA_LIBS: self.tab_dashboard = self.tabview.add("Dashboard")
        self.tab_software = self.tabview.add("Software Projects")
        self.tab_training = self.tabview.add("Training")
        self.tab_freelancers = self.tabview.add("Freelancers")
        self.tab_services = self.tabview.add("Manage Services")
        self.tab_clients = self.tabview.add("Clients")
        self.tab_quote = self.tabview.add("Sales Quote")
        self.tab_tasks = self.tabview.add("Task Board") 
        self.tab_finance = self.tabview.add("Financials & P&L")
        self.tab_receivables = self.tabview.add("Receivables (المدفوعات)")
        self.tab_reports = self.tabview.add("Reports") 
        self.tab_sync = self.tabview.add("Sync Log")

        if HAS_EXTRA_LIBS: self.setup_dashboard_tab()
        self.setup_software_tab(); self.setup_training_tab(); self.setup_freelancers_tab()
        self.setup_services_tab(); self.setup_clients_tab(); self.setup_quote_tab()
        self.setup_tasks_tab();
        self.setup_finance_tab(); self.setup_receivables_tab(); self.setup_reports_tab(); self.setup_sync_tab()
        
        self.apply_privacy_state()

    def refresh_all_dropdowns(self):
        self.load_dynamic_templates()
        self.soft_combo.configure(values=list(self.software_projects.keys()) if self.software_projects else ["No Templates"])
        self.train_combo.configure(values=list(self.training_projects.keys()) if self.training_projects else ["No Templates"])
        self.client_proj_combo.configure(values=self.all_project_names if self.all_project_names else ["None"])
        if hasattr(self, 'team_freelancer_combo'): self.team_freelancer_combo.configure(values=self.freelancers_list)
        
        if hasattr(self, 'soft_client_combo'): self.soft_client_combo.configure(values=self.client_names_list if self.client_names_list else ["No Clients Yet"])
        if hasattr(self, 'train_client_combo'): self.train_client_combo.configure(values=self.client_names_list if self.client_names_list else ["No Clients Yet"])
        
        if hasattr(self, 'train_instructor_combo'): self.train_instructor_combo.configure(values=self.freelancers_list)
        if hasattr(self, 'quote_client_combo'): self.quote_client_combo.configure(values=self.client_names_list if self.client_names_list else ["No Clients Yet"])
        if hasattr(self, 'quote_service_combo'): self.quote_service_combo.configure(values=["Custom..."] + self.all_project_names)
        if hasattr(self, 'free_entries') and "Specialization:" in self.free_entries: self.free_entries["Specialization:"].configure(values=self.combined_specs)
        
        if hasattr(self, 'filter_spec_combo'):
            current_val = self.filter_spec_var.get()
            self.filter_spec_combo.configure(values=["All Specializations"] + self.combined_specs)
            if current_val not in ["All Specializations"] + self.combined_specs: self.filter_spec_var.set("All Specializations")

        if self.software_projects: self.soft_combo.set(list(self.software_projects.keys())[0]); self.load_software_details(self.soft_combo.get())
        if self.training_projects: self.train_combo.set(list(self.training_projects.keys())[0]); self.load_train_details(self.train_combo.get())
        if self.all_project_names: self.client_proj_combo.set(self.all_project_names[0])

    # ================= Dashboard Tab =================
    def setup_dashboard_tab(self):
        top_frame = ctk.CTkFrame(self.tab_dashboard, fg_color="transparent"); top_frame.pack(pady=10)
        ctk.CTkButton(top_frame, text="🔄 Refresh Dashboard", font=("Arial", 16, "bold"), command=self.refresh_dashboard).pack(side="left", padx=10)
        
        self.dash_eye_btn = ctk.CTkButton(top_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.dash_eye_btn.pack(side="left", padx=10)
        self.eye_buttons.append(self.dash_eye_btn)

        self.chart_frame = ctk.CTkFrame(self.tab_dashboard, fg_color="transparent"); self.chart_frame.pack(fill="both", expand=True, padx=20, pady=10)
        self.refresh_dashboard()

    def refresh_dashboard(self):
        for widget in self.chart_frame.winfo_children(): widget.destroy()
        if self.privacy_mode:
            ctk.CTkLabel(self.chart_frame, text="🔒 Dashboard Data is Locked.\nClick the 👁️ button above to unlock.", font=("Arial", 24, "bold"), text_color="#ff4757").pack(pady=100)
            return

        conn = sqlite3.connect(DB_PATH, timeout=20)
        df = pd.read_sql_query("SELECT type, net_profit, client_price, paid_amount FROM pricing_records", conn)
        conn.close()
        if df.empty:
            ctk.CTkLabel(self.chart_frame, text="No Data Available Yet", font=("Arial", 24)).pack(pady=50); return

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4), facecolor='#0a192f')
        profit_by_type = df.groupby('type')['net_profit'].sum()
        if not profit_by_type.empty:
            ax1.pie(profit_by_type, labels=profit_by_type.index, autopct='%1.1f%%', startangle=90, colors=['#00BFFF', '#28a745'], textprops={'color':"w", 'weight':'bold'})
        ax1.set_title("Net Profit by Category", color="white", weight='bold')

        total_rev = df['paid_amount'].sum() if not df.empty else 0
        total_prof = df['net_profit'].sum() if not df.empty else 0
        ax2.bar(['Total Revenue', 'Net Profit'], [total_rev, total_prof], color=['#17a2b8', '#28a745'])
        ax2.set_title("Overall Financials (EGP)", color="white", weight='bold')
        ax2.tick_params(colors='white')

        canvas = FigureCanvasTkAgg(fig, master=self.chart_frame); canvas.draw()
        canvas.get_tk_widget().pack(fill="both", expand=True)

    # ================= Software Projects Tab =================
    def setup_software_tab(self):
        my_scroll = ctk.CTkScrollableFrame(self.tab_software, fg_color="transparent")
        my_scroll.pack(fill="both", expand=True)
        self.tab_software = my_scroll
        
        self.project_team_members = {} 
        self.soft_price_var, self.soft_exp_var, self.soft_paid_var = ctk.StringVar(), ctk.StringVar(), ctk.StringVar()
        for var in [self.soft_price_var, self.soft_exp_var, self.soft_paid_var]: var.trace_add("write", self.calculate_software)

        top_frame = ctk.CTkFrame(self.tab_software, fg_color="transparent"); top_frame.pack(pady=10)
        ctk.CTkLabel(top_frame, text="Project Template:", font=("Arial", 16, "bold")).grid(row=0, column=0, padx=10, pady=5)
        self.soft_combo = ctk.CTkComboBox(top_frame, values=list(getattr(self, 'software_projects', {}).keys()) if getattr(self, 'software_projects', {}) else ["No Templates"], width=250, font=("Arial", 16, "bold"), command=self.load_software_details)
        self.soft_combo.grid(row=0, column=1, padx=10, pady=5)
        
        ctk.CTkLabel(top_frame, text="Select Client:", font=("Arial", 16, "bold"), text_color="#28a745").grid(row=1, column=0, padx=10, pady=10)
        self.soft_client_combo = ctk.CTkComboBox(top_frame, values=getattr(self, 'client_names_list', ["No Clients Yet"]) if getattr(self, 'client_names_list', []) else ["No Clients Yet"], width=250, font=("Arial", 16, "bold"))
        self.soft_client_combo.grid(row=1, column=1, padx=10, pady=10)

        team_frame = ctk.CTkFrame(self.tab_software, border_width=1, border_color="#ffc107")
        team_frame.pack(pady=5, padx=20, fill="x")
        ctk.CTkLabel(team_frame, text="👥 Assign Team:", font=("Arial", 16, "bold"), text_color="#ffc107").grid(row=0, column=0, padx=10, pady=5)
        self.team_freelancer_combo = ctk.CTkComboBox(team_frame, values=getattr(self, 'freelancers_list', []), width=200, font=("Arial", 14))
        self.team_freelancer_combo.grid(row=0, column=1, padx=10, pady=5)
        ctk.CTkLabel(team_frame, text="Comm (EGP):", font=("Arial", 14, "bold")).grid(row=0, column=2, padx=5, pady=5)
        self.team_comm_entry = ctk.CTkEntry(team_frame, width=100, font=("Arial", 14))
        self.team_comm_entry.grid(row=0, column=3, padx=5, pady=5)
        ctk.CTkButton(team_frame, text="➕ Add to Team", font=("Arial", 14, "bold"), fg_color="#17a2b8", command=self.add_member_to_team).grid(row=0, column=4, padx=10)
        ctk.CTkButton(team_frame, text="🗑 Clear Team", font=("Arial", 14, "bold"), fg_color="red", width=100, command=self.clear_team).grid(row=0, column=5, padx=10)
        self.team_listbox = ctk.CTkTextbox(team_frame, height=60, font=("Arial", 14))
        self.team_listbox.grid(row=1, column=0, columnspan=6, padx=10, pady=5, sticky="ew")

        date_frame = ctk.CTkFrame(self.tab_software, fg_color="transparent"); date_frame.pack(pady=5)
        ctk.CTkLabel(date_frame, text="Start Date:", font=("Arial", 16, "bold"), text_color="#00BFFF").pack(side="left", padx=10)
        self.soft_start_date = DateEntry(date_frame, width=15, font=('Arial', 14, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        self.soft_start_date.pack(side="left", padx=10)
        ctk.CTkLabel(date_frame, text="Deadline:", font=("Arial", 16, "bold"), text_color="#ff4757").pack(side="left", padx=10)
        self.soft_deadline = DateEntry(date_frame, width=15, font=('Arial', 14, 'bold'), background='#ff4757', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        self.soft_deadline.pack(side="left", padx=10)

        input_frame = ctk.CTkFrame(self.tab_software, fg_color="transparent"); input_frame.pack(pady=5)
        ctk.CTkLabel(input_frame, text="Project Price (EGP):", font=("Arial", 16, "bold")).grid(row=0, column=0, padx=10, pady=10, sticky="e")
        self.soft_price_entry = ctk.CTkEntry(input_frame, textvariable=self.soft_price_var, font=("Arial", 16, "bold"), width=150, validate="key", validatecommand=self.vcmd_num)
        self.soft_price_entry.grid(row=0, column=1)
        self.apply_live_format(self.soft_price_entry)
        
        ctk.CTkLabel(input_frame, text="Other Expenses:", font=("Arial", 16, "bold")).grid(row=0, column=2, padx=10, pady=10, sticky="e")
        self.soft_exp_entry = ctk.CTkEntry(input_frame, textvariable=self.soft_exp_var, font=("Arial", 16, "bold"), width=150, validate="key", validatecommand=self.vcmd_num)
        self.soft_exp_entry.grid(row=0, column=3)
        self.apply_live_format(self.soft_exp_entry)

        self.soft_eye_btn = ctk.CTkButton(input_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.soft_eye_btn.grid(row=0, column=4, padx=15)
        self.eye_buttons.append(self.soft_eye_btn)

        ctk.CTkLabel(input_frame, text="Paid Amount:", font=("Arial", 16, "bold"), text_color="#28a745").grid(row=1, column=0, padx=10, pady=10, sticky="e")
        self.soft_paid_entry = ctk.CTkEntry(input_frame, textvariable=self.soft_paid_var, font=("Arial", 16, "bold"), width=150, validate="key", validatecommand=self.vcmd_num)
        self.soft_paid_entry.grid(row=1, column=1)
        self.apply_live_format(self.soft_paid_entry)
        
        ctk.CTkLabel(input_frame, text="Next Payment Date:", font=("Arial", 16, "bold"), text_color="#17a2b8").grid(row=1, column=2, padx=10, pady=10, sticky="e")
        self.soft_next_pay_date = DateEntry(input_frame, width=15, font=('Arial', 14, 'bold'), background='#17a2b8', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        self.soft_next_pay_date.grid(row=1, column=3, padx=10, pady=10, sticky="w")

        notes_frame = ctk.CTkFrame(self.tab_software, fg_color="transparent"); notes_frame.pack(pady=5, fill="x", padx=100)
        ctk.CTkLabel(notes_frame, text="Project Notes:", font=("Arial", 16, "bold")).pack(anchor="w")
        self.soft_notes = ctk.CTkTextbox(notes_frame, height=40, font=("Arial", 14)); self.soft_notes.pack(fill="x")

        self.result_textbox_soft = ctk.CTkTextbox(self.tab_software, width=900, height=130, font=("Arial", 18, "bold")); self.result_textbox_soft.pack(pady=5)

        btn_frame = ctk.CTkFrame(self.tab_software, fg_color="transparent"); btn_frame.pack(pady=5)
        self.soft_save_btn = ctk.CTkButton(btn_frame, text="💾 Assign & Save Project", font=("Arial", 18, "bold"), fg_color="#28a745", hover_color="#218838", height=45, command=self.save_software_to_db)
        self.soft_save_btn.pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="🧹 مسح البيانات", font=("Arial", 16, "bold"), fg_color="#6c757d", hover_color="#5a6268", height=45, command=self.clear_software_fields).pack(side="left", padx=10)

        list_frame = ctk.CTkFrame(self.tab_software); list_frame.pack(fill="both", expand=True, padx=40, pady=5)
        ctk.CTkLabel(list_frame, text="Saved Software Projects (Double-Click to Edit)", font=("Arial", 16, "bold"), text_color="#17a2b8").pack(pady=5)
        cols = ("ID", "Project", "Client", "Price", "Paid", "Remaining", "Status", "Deadline")
        self.soft_tree = ttk.Treeview(list_frame, columns=cols, show="headings", height=5)
        self.make_treeview_sortable(self.soft_tree)
        for c in cols: self.soft_tree.column(c, anchor="center", width=100)
        self.soft_tree.column("Project", width=200); self.soft_tree.pack(fill="both", expand=True, padx=10, pady=5)
        self.soft_tree.bind('<Double-1>', self.double_click_software)

        if getattr(self, 'software_projects', {}): self.soft_combo.set(list(self.software_projects.keys())[0]); self.load_software_details(self.soft_combo.get())
        self.clear_software_fields(); self.load_software_projects()

    def add_member_to_team(self):
        member = self.team_freelancer_combo.get()
        if member == "-- Select Freelancer/Instructor --" or not member: return
        try: comm = float(self.team_comm_entry.get().replace(',', ''))
        except ValueError: return messagebox.showwarning("Warning", "Enter a valid commission amount.")
        self.project_team_members[member] = comm
        self.update_team_listbox(); self.team_comm_entry.delete(0, 'end'); self.calculate_software()

    def clear_team(self):
        self.project_team_members.clear(); self.update_team_listbox(); self.calculate_software()

    def update_team_listbox(self):
        self.team_listbox.delete("1.0", "end")
        for member, comm in self.project_team_members.items():
            self.team_listbox.insert("end", f"👤 {member} - Commission: {self.format_num(comm)} EGP\n")

    def clear_software_fields(self):
        self.editing_soft_id = None
        if hasattr(self, 'soft_save_btn'): self.soft_save_btn.configure(text="💾 Assign & Save Project", fg_color="#28a745", text_color="white")
        self.soft_price_var.set(""); self.soft_exp_var.set(""); self.soft_paid_var.set("")
        self.soft_notes.delete("1.0", "end"); self.result_textbox_soft.delete("1.0", "end")
        self.clear_team()
        if getattr(self, 'software_projects', {}): self.soft_combo.set(list(self.software_projects.keys())[0])

    def load_software_details(self, choice):
        if hasattr(self, 'software_projects') and choice in self.software_projects:
            data = self.software_projects[choice]
            self.soft_price_var.set(self.format_num(data["price"])); self.soft_exp_var.set(self.format_num(data["expenses"]))

    def calculate_software(self, *args):
        try:
            self.soft_client_price = float(self.soft_price_var.get().replace(',', '') or 0)
            other_exp = float(self.soft_exp_var.get().replace(',', '') or 0)
            self.soft_paid_amount = float(self.soft_paid_var.get().replace(',', '') or 0)
            
            self.calc_freelancer_commission = sum(self.project_team_members.values())
            self.soft_total_cost = other_exp + self.calc_freelancer_commission
            self.soft_net_profit = self.soft_client_price - self.soft_total_cost
            self.soft_remaining_amount = self.soft_client_price - self.soft_paid_amount

            res = f"💰 Total Project Price: {self.format_money(self.soft_client_price)} EGP | 💵 Paid: {self.format_money(self.soft_paid_amount)} EGP\n"
            res += f"⏳ Remaining (المتبقي): {self.format_money(self.soft_remaining_amount)} EGP\n"
            res += f"👥 Total Team Commission: {self.format_money(self.calc_freelancer_commission)} EGP\n"
            res += f"🏆 Fratelanza Net Profit: {self.format_money(self.soft_net_profit)} EGP\n"
            self.result_textbox_soft.delete("1.0", "end"); self.result_textbox_soft.insert("1.0", res)
        except ValueError: pass

    def double_click_software(self, event):
        selected = self.soft_tree.selection()
        if not selected: return
        if self.privacy_mode: return messagebox.showinfo("Locked", "Please unlock data 👁️ first to edit.")
        
        self.editing_soft_id = self.soft_tree.item(selected[0])['values'][0]
        
        conn = sqlite3.connect(DB_PATH, timeout=20); cursor = conn.cursor()
        row = cursor.execute("SELECT project_name, client_name, start_date, deadline, client_price, total_cost, paid_amount, next_payment_date, notes FROM pricing_records WHERE id=?", (self.editing_soft_id,)).fetchone()
        
        if not row: conn.close(); return
        proj_name, client, s_date, d_line, price, t_cost, paid, next_dt, notes = row
        
        try: self.soft_combo.set(proj_name)
        except: pass
        try: self.soft_client_combo.set(client if client else "No Clients Yet")
        except: pass
        
        try: self.soft_start_date.set_date(datetime.strptime(s_date, '%Y-%m-%d'))
        except: pass
        try: self.soft_deadline.set_date(datetime.strptime(d_line, '%Y-%m-%d'))
        except: pass
        try: 
            if next_dt: self.soft_next_pay_date.set_date(datetime.strptime(next_dt, '%Y-%m-%d'))
        except: pass
        
        self.soft_price_var.set(str(price or 0))
        self.soft_paid_var.set(str(paid or 0))
        
        team_rows = cursor.execute("SELECT freelancer_name, commission FROM project_team WHERE project_id=?", (self.editing_soft_id,)).fetchall()
        self.project_team_members.clear()
        total_comm = 0
        for f_name, comm in team_rows:
            self.project_team_members[f_name] = comm
            total_comm += comm
            
        other_exp = (t_cost or 0) - total_comm
        self.soft_exp_var.set(str(other_exp))
        conn.close()
            
        self.soft_notes.delete("1.0", "end"); self.soft_notes.insert("1.0", str(notes) if notes else "")
        self.update_team_listbox()
        
        self.soft_save_btn.configure(text="🔄 Update Project", fg_color="#ffc107", text_color="black")
        messagebox.showinfo("Edit Mode", "Project and Team loaded. Make your changes and click 'Update Project'.")

    def load_software_projects(self):
        for row in getattr(self, 'soft_tree', ttk.Treeview()).get_children(): self.soft_tree.delete(row)
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            # شلنا الفلتر عشان مفيش مشروع يضيع وتشوف كل الداتا
            query = "SELECT id, project_name, client_name, client_price, paid_amount, remaining_amount, status, deadline FROM pricing_records ORDER BY id DESC"
            for row in conn.cursor().execute(query).fetchall(): 
                f_row = list(row)
                f_row[3] = self.format_money(f_row[3])
                f_row[4] = self.format_money(f_row[4] if f_row[4] else 0)
                f_row[5] = self.format_money(f_row[5] if f_row[5] else 0)
                self.soft_tree.insert("", "end", values=f_row)
        except Exception: pass
        finally: conn.close()

    def save_software_to_db(self):
        project_name = self.soft_combo.get()
        if project_name == "No Templates": return messagebox.showwarning("Warning", "Please add a template first.")
        assigned_client = self.soft_client_combo.get()
        if assigned_client == "No Clients Yet": assigned_client = ""

        date_today = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        s_date = self.soft_start_date.get_date().strftime('%Y-%m-%d')
        d_line = self.soft_deadline.get_date().strftime('%Y-%m-%d')
        next_pay = self.soft_next_pay_date.get_date().strftime('%Y-%m-%d')
        notes = self.soft_notes.get("1.0", "end-1c").strip()

        try:
            price = float(self.soft_price_var.get().replace(',', '') or 0)
            exp = float(self.soft_exp_var.get().replace(',', '') or 0)
            paid = float(self.soft_paid_var.get().replace(',', '') or 0)
        except ValueError:
            return messagebox.showerror("Warning", "Invalid Number")

        team_comm = sum(self.project_team_members.values())
        cost = exp + team_comm
        net = price - cost
        rem = price - paid

        if getattr(self, 'editing_soft_id', None):
            q1 = '''UPDATE pricing_records SET project_name=?, client_name=?, client_price=?, total_cost=?, net_profit=?, freelancer_commission=?, start_date=?, deadline=?, paid_amount=?, remaining_amount=?, next_payment_date=?, notes=? WHERE id=?'''
            p1 = (project_name, assigned_client, price, cost, net, team_comm, s_date, d_line, paid, rem, next_pay, notes, self.editing_soft_id)
            self.execute_local_and_queue_sync(q1, p1)
            
            self.execute_local_and_queue_sync("DELETE FROM project_team WHERE project_id=?", (self.editing_soft_id,))
            for member, comm in self.project_team_members.items():
                self.execute_local_and_queue_sync("INSERT INTO project_team (project_id, freelancer_name, commission) VALUES (?, ?, ?)", (self.editing_soft_id, member, comm))
            
            self.editing_soft_id = None
            msg = "Project and Team UPDATED successfully!"
        else:
            q1 = '''INSERT INTO pricing_records (type, project_name, client_name, client_price, total_cost, net_profit, freelancer_commission, date, start_date, deadline, status, paid_amount, remaining_amount, next_payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'''
            p1 = ("Software", project_name, assigned_client, price, cost, net, team_comm, date_today, s_date, d_line, "Ongoing", paid, rem, next_pay, notes)
            
            conn = sqlite3.connect(DB_PATH, timeout=20); cursor = conn.cursor()
            cursor.execute(q1, p1); new_id = cursor.lastrowid
            import json
            mysql_query = q1.replace('?', '%s')
            cursor.execute("INSERT INTO sync_queue (query, params) VALUES (?, ?)", (mysql_query, json.dumps(p1)))
            conn.commit(); conn.close()

            for member, comm in self.project_team_members.items():
                if float(comm) > 0:
                    q_exp = "INSERT INTO general_expenses (description, amount, date) VALUES (?, ?, ?)"
                    p_exp = (f"Commission: {member} - Project: {project_name}", comm, date_today)
                    self.execute_local_and_queue_sync(q_exp, p_exp)
                
                self.execute_local_and_queue_sync("INSERT INTO project_team (project_id, freelancer_name, commission) VALUES (?, ?, ?)", (new_id, member, comm))
                self.execute_local_and_queue_sync("UPDATE freelancers SET earned = earned + ? WHERE name = ?", (comm, member))
                
            msg = "Project assigned & Team SAVED instantly!"

        messagebox.showinfo("Success", msg)
        self.project_team_members.clear(); self.update_team_listbox()
        self.soft_price_var.set(""); self.soft_exp_var.set(""); self.soft_paid_var.set(""); self.result_textbox_soft.delete("1.0", "end")
        self.load_software_projects(); self.refresh_finance_data(use_dates=False); self.load_receivables(); self.load_reports()

    # ================= Training Projects Tab =================
    def setup_training_tab(self):
        self.tr_trainee_cost_var, self.tr_exp_var, self.tr_std_var, self.tr_inst_pct_var = ctk.StringVar(), ctk.StringVar(), ctk.StringVar(), ctk.StringVar()
        for var in [self.tr_trainee_cost_var, self.tr_exp_var, self.tr_std_var, self.tr_inst_pct_var]: var.trace_add("write", self.calculate_training)

        top_frame = ctk.CTkFrame(self.tab_training, fg_color="transparent"); top_frame.pack(pady=20)
        ctk.CTkLabel(top_frame, text="Select Course Template:", font=("Arial", 16, "bold")).grid(row=0, column=0, padx=10, pady=5)
        self.train_combo = ctk.CTkComboBox(top_frame, values=list(self.training_projects.keys()) if self.training_projects else ["No Templates"], width=300, font=("Arial", 16, "bold"), command=self.load_train_details)
        self.train_combo.grid(row=0, column=1, padx=10, pady=5)
        
        ctk.CTkLabel(top_frame, text="Assign Instructor:", font=("Arial", 16, "bold"), text_color="#ffc107").grid(row=0, column=2, padx=10, pady=5)
        self.train_instructor_combo = ctk.CTkComboBox(top_frame, values=self.freelancers_list, width=250, font=("Arial", 16, "bold"))
        self.train_instructor_combo.grid(row=0, column=3, padx=10, pady=5)
        
        ctk.CTkLabel(top_frame, text="Select Client:", font=("Arial", 16, "bold"), text_color="#28a745").grid(row=1, column=0, padx=10, pady=10)
        self.train_client_combo = ctk.CTkComboBox(top_frame, values=self.client_names_list if self.client_names_list else ["No Clients Yet"], width=300, font=("Arial", 16, "bold"))
        self.train_client_combo.grid(row=1, column=1, padx=10, pady=10)

        date_frame = ctk.CTkFrame(self.tab_training, fg_color="transparent"); date_frame.pack(pady=5)
        ctk.CTkLabel(date_frame, text="Start Date:", font=("Arial", 16, "bold"), text_color="#00BFFF").pack(side="left", padx=10)
        self.train_start_date = DateEntry(date_frame, width=15, font=('Arial', 14, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        self.train_start_date.pack(side="left", padx=10)
        ctk.CTkLabel(date_frame, text="Deadline:", font=("Arial", 16, "bold"), text_color="#ff4757").pack(side="left", padx=10)
        self.train_deadline = DateEntry(date_frame, width=15, font=('Arial', 14, 'bold'), background='#ff4757', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        self.train_deadline.pack(side="left", padx=10)

        input_frame = ctk.CTkFrame(self.tab_training, fg_color="transparent"); input_frame.pack(pady=20)
        ctk.CTkLabel(input_frame, text="Desired Trainee Cost:", font=("Arial", 18, "bold")).grid(row=0, column=0, padx=15, pady=15, sticky="e")
        self.tr_trainee_cost_entry = ctk.CTkEntry(input_frame, textvariable=self.tr_trainee_cost_var, font=("Arial", 18, "bold"), width=200, validate="key", validatecommand=self.vcmd_num)
        self.tr_trainee_cost_entry.grid(row=0, column=1)
        self.apply_live_format(self.tr_trainee_cost_entry)
        
        ctk.CTkLabel(input_frame, text="Expenses:", font=("Arial", 18, "bold")).grid(row=1, column=0, padx=15, pady=15, sticky="e")
        self.tr_exp_entry = ctk.CTkEntry(input_frame, textvariable=self.tr_exp_var, font=("Arial", 18, "bold"), width=200, validate="key", validatecommand=self.vcmd_num)
        self.tr_exp_entry.grid(row=1, column=1)
        self.apply_live_format(self.tr_exp_entry)
        
        self.tr_eye_btn = ctk.CTkButton(input_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.tr_eye_btn.grid(row=0, column=2, rowspan=2, padx=15)
        self.eye_buttons.append(self.tr_eye_btn)
        
        ctk.CTkLabel(input_frame, text="Trainees:", font=("Arial", 18, "bold")).grid(row=0, column=3, padx=15, pady=15, sticky="e")
        self.tr_std_entry = ctk.CTkEntry(input_frame, textvariable=self.tr_std_var, font=("Arial", 18, "bold"), width=200, validate="key", validatecommand=self.vcmd_num)
        self.tr_std_entry.grid(row=0, column=4)
        self.apply_live_format(self.tr_std_entry)
        
        ctk.CTkLabel(input_frame, text="Instructor Percentage (%):", font=("Arial", 18, "bold"), text_color="#ffc107").grid(row=1, column=3, padx=15, pady=15, sticky="e")
        self.tr_inst_pct_entry = ctk.CTkEntry(input_frame, textvariable=self.tr_inst_pct_var, font=("Arial", 18, "bold"), width=200)
        self.tr_inst_pct_entry.grid(row=1, column=4)
        self.apply_live_format(self.tr_inst_pct_entry)

        self.result_textbox_train = ctk.CTkTextbox(self.tab_training, width=800, height=180, font=("Arial", 22, "bold")); self.result_textbox_train.pack(pady=20)

        btn_frame = ctk.CTkFrame(self.tab_training, fg_color="transparent"); btn_frame.pack(pady=10)
        ctk.CTkButton(btn_frame, text="💾 Save Course & Assign", font=("Arial", 20, "bold"), fg_color="#007bff", hover_color="#0056b3", height=50, command=self.save_train_to_db).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="🧹 مسح البيانات", font=("Arial", 18, "bold"), fg_color="#6c757d", hover_color="#5a6268", height=50, command=self.clear_training_fields).pack(side="left", padx=10)

        if self.training_projects: self.train_combo.set(list(self.training_projects.keys())[0]); self.load_train_details(self.train_combo.get())

    def clear_training_fields(self):
        self.tr_trainee_cost_var.set("")
        self.tr_exp_var.set("")
        self.tr_std_var.set("")
        self.tr_inst_pct_var.set("")
        self.result_textbox_train.delete("1.0", "end")
        if self.training_projects: self.train_combo.set(list(self.training_projects.keys())[0])

    def load_train_details(self, choice):
        if choice in self.training_projects:
            data = self.training_projects[choice]
            self.tr_trainee_cost_var.set(self.format_num(data["trainee_cost"])); self.tr_exp_var.set(self.format_num(data["expenses"]))
            self.tr_std_var.set(self.format_num(data["students"])); self.tr_inst_pct_var.set(str(data["inst_pct"]))

    def calculate_training(self, *args):
        try:
            trainee_cost = float(self.tr_trainee_cost_var.get().replace(',', '') or 0)
            expenses = float(self.tr_exp_var.get().replace(',', '') or 0)
            students = int(float(self.tr_std_var.get().replace(',', '') or 1))
            inst_pct = float(self.tr_inst_pct_var.get().replace(',', '') or 0) / 100

            self.train_target_rev = trainee_cost * students
            net_before_inst = self.train_target_rev - expenses
            self.calc_instructor_cost = net_before_inst * inst_pct if net_before_inst > 0 else 0
            
            self.train_total_cost = expenses + self.calc_instructor_cost
            self.train_net_profit = self.train_target_rev - self.train_total_cost

            res = f"✅ Suggested Price / Trainee: {self.format_money(trainee_cost)} EGP\n"
            res += f"💰 Expected Revenue: {self.format_money(self.train_target_rev)} EGP | 🔻 Cost (Exp+Inst): {self.format_money(self.train_total_cost)} EGP\n"
            res += f"🎓 Instructor Earnings: {self.format_money(self.calc_instructor_cost)} EGP\n"
            res += f"🏆 Fratelanza Net Profit: {self.format_money(self.train_net_profit)} EGP"
            self.result_textbox_train.delete("1.0", "end"); self.result_textbox_train.insert("1.0", res)
        except ValueError: pass

    def save_train_to_db(self):
        course_name = self.train_combo.get()
        if course_name == "No Templates": return messagebox.showwarning("Warning", "Please add a template first from Manage Services.")
        
        assigned_inst = self.train_instructor_combo.get()
        if assigned_inst == "-- Select Freelancer/Instructor --" or not assigned_inst: assigned_inst = ""
        
        assigned_client = self.train_client_combo.get()
        if assigned_client == "No Clients Yet": assigned_client = ""
        
        s_date = self.train_start_date.get_date().strftime('%Y-%m-%d')
        d_line = self.train_deadline.get_date().strftime('%Y-%m-%d')

        q = "INSERT INTO pricing_records (type, project_name, client_price, total_cost, net_profit, freelancer_name, freelancer_commission, date, start_date, deadline, status, client_name, paid_amount, remaining_amount, next_payment_date, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, '', '')"
        p = ("Training", course_name, getattr(self, 'train_target_rev', 0), getattr(self, 'train_total_cost', 0), getattr(self, 'train_net_profit', 0), assigned_inst, getattr(self, 'calc_instructor_cost', 0), datetime.now().strftime('%Y-%m-%d %H:%M:%S'), s_date, d_line, "Ongoing", assigned_client)
        self.execute_local_and_queue_sync(q, p)
        
        if assigned_inst:
            q2 = "UPDATE freelancers SET earned = earned + ? WHERE name = ?"
            self.execute_local_and_queue_sync(q2, (getattr(self, 'calc_instructor_cost', 0), assigned_inst))
            
        messagebox.showinfo("Success", "Course assigned & saved instantly!")
        self.clear_training_fields()
        if hasattr(self, 'load_tasks'): self.load_tasks()
        self.load_reports(); self.load_freelancers(); self.refresh_finance_data(use_dates=False)

    # ================= Task Board (Kanban) Tab =================
    def setup_tasks_tab(self):
        main_frame = ctk.CTkFrame(self.tab_tasks, fg_color="transparent")
        main_frame.pack(fill="both", expand=True, padx=20, pady=10)
        
        main_frame.grid_columnconfigure(0, weight=1)
        main_frame.grid_columnconfigure(1, weight=1)
        
        left_frame = ctk.CTkFrame(main_frame, fg_color="#1e293b", corner_radius=15)
        left_frame.grid(row=0, column=0, padx=10, sticky="nsew")
        
        right_frame = ctk.CTkFrame(main_frame, fg_color="#102a43", corner_radius=15)
        right_frame.grid(row=0, column=1, padx=10, sticky="nsew")
        
        ctk.CTkLabel(left_frame, text="⏳ Ongoing Projects (In Progress)", font=("Arial", 20, "bold"), text_color="#ffc107").pack(pady=15)
        ctk.CTkLabel(right_frame, text="✅ Completed Projects (Done)", font=("Arial", 20, "bold"), text_color="#28a745").pack(pady=15)
        
        cols = ("ID", "Type", "Project", "Freelancer", "Deadline")
        
        self.ongoing_tree = ttk.Treeview(left_frame, columns=cols, show="headings")
        self.make_treeview_sortable(self.ongoing_tree)
        for c in cols: self.ongoing_tree.column(c, anchor="center", width=100)
        self.ongoing_tree.column("Project", width=250)
        self.ongoing_tree.pack(fill="both", expand=True, padx=15, pady=10)
        
        self.completed_tree = ttk.Treeview(right_frame, columns=cols, show="headings")
        self.make_treeview_sortable(self.completed_tree)
        for c in cols: self.completed_tree.column(c, anchor="center", width=100)
        self.completed_tree.column("Project", width=250)
        self.completed_tree.pack(fill="both", expand=True, padx=15, pady=10)
        
        ctk.CTkButton(left_frame, text="🚀 Mark Selected as Completed & Evaluate", font=("Arial", 18, "bold"), fg_color="#28a745", hover_color="#218838", height=45, command=self.evaluate_task).pack(pady=15)
        
        self.load_tasks()

    def load_tasks(self):
        for row in self.ongoing_tree.get_children(): self.ongoing_tree.delete(row)
        for row in self.completed_tree.get_children(): self.completed_tree.delete(row)
        
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            query = "SELECT id, type, project_name, freelancer_name, deadline, status FROM pricing_records"
            for row in conn.cursor().execute(query).fetchall():
                f_row = [row[0], row[1], row[2], row[3], row[4]]
                status = row[5]
                if status == "Completed":
                    self.completed_tree.insert("", "end", values=f_row)
                else:
                    self.ongoing_tree.insert("", "end", values=f_row)
        except Exception: pass
        finally: conn.close()

    def evaluate_task(self):
        selected = self.ongoing_tree.selection()
        if not selected: return messagebox.showwarning("Warning", "Select an ongoing project to evaluate!")
        
        values = self.ongoing_tree.item(selected[0])['values']
        p_id = values[0]
        freelancer_name = values[3]
        deadline = values[4]
        
        today = datetime.now().strftime('%Y-%m-%d')
        
        penalty = 0.0
        msg = "Project marked as Completed."
        
        if deadline and str(deadline) != "None" and str(deadline).strip() != "":
            if today > str(deadline):
                penalty = 0.5 
                msg += f"\n\n🚨 Delay Detected! {freelancer_name} missed the deadline ({deadline}).\nRating penalized by -0.5 ⭐."
            else:
                penalty = -0.1 
                msg += f"\n\n🏆 Good Job! {freelancer_name} delivered on time.\nRating boosted by +0.1 ⭐."
        
        self.execute_local_and_queue_sync("UPDATE pricing_records SET status='Completed' WHERE id=?", (p_id,))
        
        if freelancer_name and str(freelancer_name) != "None" and str(freelancer_name).strip() != "":
            if penalty != 0:
                conn = sqlite3.connect(DB_PATH, timeout=20)
                try:
                    cursor = conn.cursor()
                    cursor.execute("SELECT rating FROM freelancers WHERE name=?", (freelancer_name,))
                    res = cursor.fetchone()
                    if res:
                        current_rating = float(res[0])
                        new_rating = round(max(1.0, min(5.0, current_rating - penalty)), 1)
                        self.execute_local_and_queue_sync("UPDATE freelancers SET rating=? WHERE name=?", (new_rating, freelancer_name))
                except Exception: pass
                finally: conn.close()

        messagebox.showinfo("Evaluation System", msg)
        self.load_tasks()
        if hasattr(self, 'load_reports'): self.load_reports()
        if hasattr(self, 'load_freelancers'): self.load_freelancers()

    # ================= Manage Services Tab =================
    def setup_services_tab(self):
        input_frame = ctk.CTkFrame(self.tab_services); input_frame.pack(pady=20, fill="x", padx=40)
        self.service_id_var = ctk.StringVar()
        
        ctk.CTkLabel(input_frame, text="Category:", font=("Arial", 16, "bold")).grid(row=0, column=0, padx=10, pady=10, sticky="e")
        self.srv_cat = ctk.CTkComboBox(input_frame, values=["Software", "Training"], font=("Arial", 16, "bold"), width=250, command=self.update_service_fields)
        self.srv_cat.grid(row=0, column=1, padx=10, pady=10)
        
        self.lbl_srv_name = ctk.CTkLabel(input_frame, text="Project Name:", font=("Arial", 16, "bold"))
        self.lbl_srv_name.grid(row=0, column=2, padx=10, pady=10, sticky="e")
        self.srv_name = ctk.CTkEntry(input_frame, font=("Arial", 16, "bold"), width=250); self.srv_name.grid(row=0, column=3, padx=10, pady=10)
        
        self.lbl_srv_cost = ctk.CTkLabel(input_frame, text="Customer Price:", font=("Arial", 16, "bold"))
        self.lbl_srv_cost.grid(row=0, column=4, padx=10, pady=10, sticky="e")
        self.srv_cost = ctk.CTkEntry(input_frame, font=("Arial", 16, "bold"), width=150, validate="key", validatecommand=self.vcmd_num); self.srv_cost.grid(row=0, column=5, padx=10, pady=10)
        self.apply_live_format(self.srv_cost)
        
        ctk.CTkLabel(input_frame, text="Expenses:", font=("Arial", 16, "bold")).grid(row=1, column=0, padx=10, pady=10, sticky="e")
        self.srv_exp = ctk.CTkEntry(input_frame, font=("Arial", 16, "bold"), width=250, validate="key", validatecommand=self.vcmd_num); self.srv_exp.grid(row=1, column=1, padx=10, pady=10)
        self.apply_live_format(self.srv_exp)
        
        self.lbl_srv_mult = ctk.CTkLabel(input_frame, text="Instructor %:", font=("Arial", 16, "bold"))
        self.lbl_srv_mult.grid(row=1, column=2, padx=10, pady=10, sticky="e")
        self.srv_mult = ctk.CTkEntry(input_frame, font=("Arial", 16, "bold"), width=250); self.srv_mult.grid(row=1, column=3, padx=10, pady=10)
        self.apply_live_format(self.srv_mult)
        
        ctk.CTkLabel(input_frame, text="Freelancer %:", font=("Arial", 16, "bold")).grid(row=1, column=4, padx=10, pady=10, sticky="e")
        self.srv_brok = ctk.CTkEntry(input_frame, font=("Arial", 16, "bold"), width=150, validate="key", validatecommand=self.vcmd_num); self.srv_brok.grid(row=1, column=5, padx=10, pady=10)
        self.apply_live_format(self.srv_brok)
        
        self.srv_eye_btn = ctk.CTkButton(input_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.srv_eye_btn.grid(row=1, column=6, padx=10, pady=10)
        self.eye_buttons.append(self.srv_eye_btn)

        self.lbl_srv_std = ctk.CTkLabel(input_frame, text="Students:", font=("Arial", 16, "bold"))
        self.lbl_srv_std.grid(row=2, column=0, padx=10, pady=10, sticky="e")
        self.srv_std = ctk.CTkEntry(input_frame, font=("Arial", 16, "bold"), width=250, validate="key", validatecommand=self.vcmd_num); self.srv_std.grid(row=2, column=1, padx=10, pady=10)
        self.apply_live_format(self.srv_std)
        
        btn_frame = ctk.CTkFrame(self.tab_services, fg_color="transparent"); btn_frame.pack(pady=10)
        ctk.CTkButton(btn_frame, text="➕ Add New Service", font=("Arial", 18, "bold"), height=40, fg_color="#28a745", hover_color="#218838", command=self.add_service).pack(side="left", padx=15)
        ctk.CTkButton(btn_frame, text="💾 Update Selected", font=("Arial", 18, "bold"), height=40, fg_color="#ffc107", hover_color="#e0a800", text_color="black", command=self.update_service).pack(side="left", padx=15)
        ctk.CTkButton(btn_frame, text="🗑 Delete Selected", font=("Arial", 18, "bold"), height=40, fg_color="red", command=self.confirm_delete_service).pack(side="left", padx=15)
        ctk.CTkButton(btn_frame, text="🧹 مسح البيانات", font=("Arial", 16, "bold"), height=40, fg_color="#6c757d", command=self.clear_service_fields).pack(side="left", padx=15)
        ctk.CTkButton(btn_frame, text="📊 تصدير Excel", font=("Arial", 16, "bold"), height=40, fg_color="#107c41", command=self.export_services_excel).pack(side="left", padx=15)

        columns = ("ID", "Category", "Name", "Base Price/Cost", "Expenses", "Instructor %", "Freelancer %", "Students")
        self.services_tree = ttk.Treeview(self.tab_services, columns=columns, show="headings")
        self.make_treeview_sortable(self.services_tree)
        for col in columns: self.services_tree.column(col, anchor="center", width=120)
        self.services_tree.column("Name", width=300); self.services_tree.pack(fill="both", expand=True, padx=40, pady=15)
        self.services_tree.bind('<ButtonRelease-1>', self.select_service)
        
        self.update_service_fields("Software") 
        self.load_services()

    def export_services_excel(self):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            df = pd.read_sql_query("SELECT * FROM templates", conn)
            conn.close()
            df.to_excel("Fratelanza_Services.xlsx", index=False)
            messagebox.showinfo("Success", "تم تصدير الخدمات بنجاح!")
        except Exception as e: messagebox.showerror("Error", f"Failed: {e}")

    def clear_service_fields(self):
        self.srv_name.delete(0, 'end')
        self.srv_cost.delete(0, 'end')
        self.srv_exp.delete(0, 'end')
        self.srv_mult.delete(0, 'end')
        self.srv_brok.delete(0, 'end')
        self.srv_std.delete(0, 'end')
        self.service_id_var.set("")

    def update_service_fields(self, choice):
        if choice == "Software":
            self.lbl_srv_name.configure(text="Project Name:")
            self.lbl_srv_cost.configure(text="Customer Price:")
            self.lbl_srv_mult.grid_remove(); self.srv_mult.grid_remove()
            self.lbl_srv_std.grid_remove(); self.srv_std.grid_remove()
            self.srv_mult.delete(0, 'end'); self.srv_mult.insert(0, "1") 
            self.srv_std.delete(0, 'end'); self.srv_std.insert(0, "0")
        else:
            self.lbl_srv_name.configure(text="Course Name:")
            self.lbl_srv_cost.configure(text="Trainee Price:")
            self.lbl_srv_mult.grid(); self.srv_mult.grid()
            self.lbl_srv_std.grid(); self.srv_std.grid()

    def confirm_delete_service(self):
        if not self.service_id_var.get(): return messagebox.showwarning("Warning", "Select a service to delete!")
        self.verify_action_with_password(self.execute_delete_service)

    def execute_delete_service(self):
        srv_id = self.service_id_var.get()
        q = "DELETE FROM templates WHERE id=?"
        self.execute_local_and_queue_sync(q, (srv_id,))
        self.load_services(); self.refresh_all_dropdowns()
        self.clear_service_fields()
        messagebox.showinfo("Success", "Service deleted successfully.")

    def add_service(self):
        cat = self.srv_cat.get()
        name = self.srv_name.get().strip()
        if not name: return messagebox.showwarning("Warning", "Service name is required!")
        cost = float(self.srv_cost.get().replace(',', '') or 0)
        exp = float(self.srv_exp.get().replace(',', '') or 0)
        mult = float(self.srv_mult.get().replace(',', '') or 1)
        brok = float(self.srv_brok.get().replace(',', '') or 0)
        std = int(self.srv_std.get().replace(',', '') or 0)
        q = "INSERT INTO templates (category, name, cost, expenses, multiplier, broker, students) VALUES (?, ?, ?, ?, ?, ?, ?)"
        self.execute_local_and_queue_sync(q, (cat, name, cost, exp, mult, brok, std))
        messagebox.showinfo("Success", "New Service Added Successfully!")
        self.load_services(); self.refresh_all_dropdowns()
        self.clear_service_fields()

    def load_services(self):
        for row in self.services_tree.get_children(): self.services_tree.delete(row)
        conn = sqlite3.connect(DB_PATH, timeout=20)
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM templates")
        for row in cursor.fetchall(): 
            f_row = list(row)
            f_row[3] = self.format_money(f_row[3]); f_row[4] = self.format_money(f_row[4]); f_row[6] = self.format_money(f_row[6])
            self.services_tree.insert("", "end", values=f_row)
        conn.close()

    def select_service(self, event):
        selected = self.services_tree.selection()
        if not selected: return
        if self.privacy_mode:
            messagebox.showinfo("Locked", "Please unlock data 👁️ first to edit services.")
            return
        values = self.services_tree.item(selected[0])['values']
        self.service_id_var.set(values[0])
        self.srv_cat.set(values[1])
        self.update_service_fields(values[1])
        self.srv_name.delete(0, 'end'); self.srv_name.insert(0, values[2])
        self.srv_cost.delete(0, 'end'); self.srv_cost.insert(0, str(values[3]).replace(',',''))
        self.srv_exp.delete(0, 'end'); self.srv_exp.insert(0, str(values[4]).replace(',',''))
        self.srv_mult.delete(0, 'end'); self.srv_mult.insert(0, values[5])
        self.srv_brok.delete(0, 'end'); self.srv_brok.insert(0, str(values[6]).replace(',',''))
        self.srv_std.delete(0, 'end'); self.srv_std.insert(0, values[7])

    def update_service(self):
        srv_id = self.service_id_var.get()
        if not srv_id: return messagebox.showwarning("Warning", "Select a service to update.")
        cost = float(self.srv_cost.get().replace(',', '') or 0)
        exp = float(self.srv_exp.get().replace(',', '') or 0)
        mult = float(self.srv_mult.get().replace(',', '') or 1)
        brok = float(self.srv_brok.get().replace(',', '') or 0)
        std = int(self.srv_std.get().replace(',', '') or 0)
        q = '''UPDATE templates SET category=?, name=?, cost=?, expenses=?, multiplier=?, broker=?, students=? WHERE id=?'''
        p = (self.srv_cat.get(), self.srv_name.get(), cost, exp, mult, brok, std, srv_id)
        self.execute_local_and_queue_sync(q, p)
        self.load_services(); self.refresh_all_dropdowns()
        self.clear_service_fields()
        messagebox.showinfo("Success", "Service updated successfully!")

    # ================= Freelancers Tab =================
    def setup_freelancers_tab(self):
        self.free_code_var = ctk.StringVar() 
        input_frame = ctk.CTkFrame(self.tab_freelancers); input_frame.pack(pady=10, fill="x", padx=40)
        labels = ["Name (Required):", "Phone:", "Specialization:", "Company Position:", "Total Earned:", "Remaining Balance:"]
        self.free_entries = {}
        
        for i, text in enumerate(labels):
            ctk.CTkLabel(input_frame, text=text, font=("Arial", 16, "bold")).grid(row=i//3, column=(i%3)*2, padx=10, pady=10, sticky="e")
            
            if "Specialization" in text: 
                ent = ctk.CTkComboBox(input_frame, values=getattr(self, 'combined_specs', []), width=250, font=("Arial", 16))
                def filter_specs(e, combo=ent):
                    if e.keysym in ['Up', 'Down', 'Left', 'Right', 'Return']: return
                    typed = combo.get()
                    all_specs = getattr(self, 'combined_specs', [])
                    if typed == "": combo.configure(values=all_specs)
                    else:
                        filtered = [s for s in all_specs if typed.lower() in s.lower()]
                        if "Custom..." not in filtered: filtered.append("Custom...")
                        combo.configure(values=filtered)
                ent.bind('<KeyRelease>', filter_specs)
            else:
                ent = ctk.CTkEntry(input_frame, width=200, font=("Arial", 16, "bold"))
                if "Earned" in text or "Balance" in text:
                    ent.insert(0, "0"); self.apply_live_format(ent)
                    
            ent.grid(row=i//3, column=(i%3)*2+1, padx=10, pady=10)
            self.free_entries[text] = ent

        self.free_eye_btn = ctk.CTkButton(input_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.free_eye_btn.grid(row=1, column=6, padx=15)
        self.eye_buttons.append(self.free_eye_btn)

        btn_frame = ctk.CTkFrame(self.tab_freelancers, fg_color="transparent"); btn_frame.pack(pady=5)
        ctk.CTkButton(btn_frame, text="➕ Add Freelancer/Inst", font=("Arial", 16, "bold"), height=40, command=self.add_freelancer).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="💾 Update Selected", font=("Arial", 16, "bold"), height=40, fg_color="#ffc107", hover_color="#e0a800", text_color="black", command=self.update_freelancer).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="🗑 Delete Selected", font=("Arial", 16, "bold"), fg_color="red", height=40, command=self.confirm_del_freelancer).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="🧹 مسح البيانات", font=("Arial", 16, "bold"), fg_color="#6c757d", height=40, command=self.clear_free_fields).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="📊 تصدير Excel", font=("Arial", 16, "bold"), fg_color="#107c41", height=40, command=self.export_freelancers_excel).pack(side="left", padx=10)

        filter_frame = ctk.CTkFrame(self.tab_freelancers); filter_frame.pack(pady=10, fill="x", padx=40, ipady=5)
        ctk.CTkLabel(filter_frame, text="🔍 Group by Spec:", font=("Arial", 16, "bold")).pack(side="left", padx=15)
        self.filter_spec_var = ctk.StringVar(value="All Specializations")
        self.filter_spec_combo = ctk.CTkComboBox(filter_frame, variable=self.filter_spec_var, values=["All Specializations"] + self.combined_specs, width=250, command=self.load_freelancers)
        self.filter_spec_combo.pack(side="left", padx=5)

        self.free_search_name = ctk.StringVar(); ctk.CTkEntry(filter_frame, textvariable=self.free_search_name, placeholder_text="Search Name...", font=("Arial", 14), width=150).pack(side="left", padx=15)
        ctk.CTkButton(filter_frame, text="Search", font=("Arial", 14, "bold"), command=self.load_freelancers, width=90).pack(side="left", padx=10)
        ctk.CTkButton(filter_frame, text="Clear", font=("Arial", 14, "bold"), fg_color="gray", command=self.clear_free_filters, width=90).pack(side="left", padx=5)

        columns = ("Code", "Name", "Phone", "Spec", "Position", "Earned", "Balance", "Rating ⭐")
        self.free_tree = ttk.Treeview(self.tab_freelancers, columns=columns, show="headings")
        self.make_treeview_sortable(self.free_tree)
        for col in columns: self.free_tree.column(col, width=120, anchor="center")
        self.free_tree.column("Name", width=180); self.free_tree.column("Spec", width=180)
        self.free_tree.pack(fill="both", expand=True, padx=40, pady=10)
        self.free_tree.bind('<ButtonRelease-1>', self.select_freelancer)
        self.load_freelancers()

    def export_freelancers_excel(self):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            df = pd.read_sql_query("SELECT * FROM freelancers", conn)
            conn.close()
            df.to_excel("Fratelanza_Freelancers.xlsx", index=False)
            messagebox.showinfo("Success", "تم تصدير المستقلين بنجاح!")
        except Exception as e: messagebox.showerror("Error", f"Failed: {e}")

    def clear_free_fields(self):
        for text, e in self.free_entries.items(): 
            if isinstance(e, ctk.CTkEntry): 
                e.delete(0, 'end')
                if "Earned" in text or "Balance" in text: e.insert(0, "0")
        self.free_code_var.set("")

    def select_freelancer(self, event):
        selected = self.free_tree.selection()
        if not selected: return
        if self.privacy_mode:
            messagebox.showinfo("Locked", "Please unlock data 👁️ first to edit freelancers.")
            return
        values = self.free_tree.item(selected[0])['values']
        self.free_code_var.set(values[0])
        labels = ["Name (Required):", "Phone:", "Specialization:", "Company Position:", "Total Earned:", "Remaining Balance:"]
        for i, text in enumerate(labels):
            widget = self.free_entries[text]
            if isinstance(widget, ctk.CTkEntry): widget.delete(0, 'end'); widget.insert(0, str(values[i+1]).replace(',', ''))
            elif isinstance(widget, ctk.CTkComboBox): widget.set(values[i+1])

    def update_freelancer(self):
        code = self.free_code_var.get()
        if not code: return messagebox.showwarning("Warning", "Please select a freelancer to update.")
        data = [e.get().strip() for e in self.free_entries.values()]
        if not data[0]: return messagebox.showwarning("Warning", "Freelancer Name cannot be empty!")
        earned = float(data[4].replace(',', '')) if data[4] and not "*" in data[4] else 0.0
        balance = float(data[5].replace(',', '')) if data[5] and not "*" in data[5] else 0.0
        self.execute_local_and_queue_sync("UPDATE freelancers SET name=?, phone=?, spec=?, position=?, earned=?, balance=? WHERE code=?", (data[0], data[1], data[2], data[3], earned, balance, code))
        self.load_dynamic_templates()
        self.refresh_all_dropdowns()
        self.load_freelancers()
        self.clear_free_fields()
        messagebox.showinfo("Success", "Freelancer updated successfully!")

    def confirm_del_freelancer(self):
        if not self.free_tree.selection(): return messagebox.showwarning("Warning", "Select a freelancer to delete!")
        self.verify_action_with_password(self.execute_del_freelancer)

    def execute_del_freelancer(self):
        selected = self.free_tree.selection(); code = self.free_tree.item(selected[0])['values'][0]
        self.execute_local_and_queue_sync("DELETE FROM freelancers WHERE code=?", (code,))
        self.load_dynamic_templates()
        self.refresh_all_dropdowns()
        self.load_freelancers()
        self.clear_free_fields()
        messagebox.showinfo("Success", "Freelancer deleted successfully.")

    def add_freelancer(self):
        data = [e.get().strip() for e in self.free_entries.values()]
        if not data[0]: return messagebox.showwarning("Warning", "Please fill in at least the Freelancer's Name!")
        code = f"FR-{datetime.now().strftime('%y%m%d%H%M')}"
        earned = float(data[4].replace(',', '')) if data[4] and not "*" in data[4] else 0.0
        balance = float(data[5].replace(',', '')) if data[5] and not "*" in data[5] else 0.0
        self.execute_local_and_queue_sync("INSERT INTO freelancers (code, name, phone, spec, position, earned, balance, rating) VALUES (?, ?, ?, ?, ?, ?, ?, 5.0)", (code, data[0], data[1], data[2], data[3], earned, balance))
        self.clear_free_fields()
        self.load_dynamic_templates()
        self.refresh_all_dropdowns()
        self.load_freelancers()

    def clear_free_filters(self): 
        self.free_search_name.set(""); self.filter_spec_var.set("All Specializations")
        self.load_freelancers()

    def load_freelancers(self, *args):
        for row in self.free_tree.get_children(): self.free_tree.delete(row)
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            n_filter = f"%{self.free_search_name.get()}%" if hasattr(self, 'free_search_name') else "%"
            s_val = self.filter_spec_var.get() if hasattr(self, 'filter_spec_var') else "All Specializations"
            s_filter = "%" if s_val == "All Specializations" else s_val
            
            for row in conn.cursor().execute("SELECT code, name, phone, spec, position, earned, balance, rating FROM freelancers WHERE name LIKE ? AND spec LIKE ? ORDER BY rating DESC, earned DESC", (n_filter, s_filter)).fetchall():
                f_row = list(row); f_row[5] = self.format_money(f_row[5]); f_row[6] = self.format_money(f_row[6])
                f_row[7] = f"{row[7]} ⭐" if len(row) > 7 else "5.0 ⭐"
                self.free_tree.insert("", "end", values=f_row)
        finally: conn.close()

    # ================= Clients & Projects Tab =================
    def setup_clients_tab(self):
        input_frame = ctk.CTkFrame(self.tab_clients); input_frame.pack(pady=10, fill="x", padx=40)
        labels = ["Client Name (Required):", "Phone:", "Address:", "Business Activity:"]
        self.client_entries = {}
        for i, text in enumerate(labels):
            ctk.CTkLabel(input_frame, text=text, font=("Arial", 16, "bold")).grid(row=i//2, column=(i%2)*2, padx=10, pady=10, sticky="e")
            ent = ctk.CTkEntry(input_frame, width=200, font=("Arial", 16, "bold")); ent.grid(row=i//2, column=(i%2)*2+1, padx=10, pady=10)
            self.client_entries[text] = ent
        
        ctk.CTkLabel(input_frame, text="Notes:", font=("Arial", 16, "bold")).grid(row=2, column=0, padx=10, pady=10, sticky="e")
        self.client_notes = ctk.CTkEntry(input_frame, width=200, font=("Arial", 14)); self.client_notes.grid(row=2, column=1, padx=10, pady=10)

        ctk.CTkLabel(input_frame, text="Requested Project:", font=("Arial", 16, "bold")).grid(row=2, column=2, padx=10, pady=10, sticky="e")
        self.client_proj_combo = ctk.CTkComboBox(input_frame, values=self.all_project_names if self.all_project_names else ["None"], width=250, font=("Arial", 16, "bold"))
        self.client_proj_combo.grid(row=2, column=3, padx=10, pady=10)

        btn_frame = ctk.CTkFrame(self.tab_clients, fg_color="transparent"); btn_frame.pack(pady=5)
        ctk.CTkButton(btn_frame, text="➕ Add Client", font=("Arial", 16, "bold"), height=40, command=self.add_client).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="🔍 View 360° Profile", font=("Arial", 16, "bold"), fg_color="#007bff", height=40, command=self.view_client_profile).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="🧹 مسح البيانات", font=("Arial", 16, "bold"), fg_color="#6c757d", height=40, command=self.clear_client_fields).pack(side="left", padx=10)
        
        filter_frame = ctk.CTkFrame(self.tab_clients); filter_frame.pack(pady=10, fill="x", padx=40, ipady=5)
        ctk.CTkLabel(filter_frame, text="🔍 Smart Filters:", font=("Arial", 16, "bold")).pack(side="left", padx=15)
        self.search_client_name = ctk.StringVar(); ctk.CTkEntry(filter_frame, textvariable=self.search_client_name, placeholder_text="Name...", font=("Arial", 14), width=150).pack(side="left", padx=5)
        self.search_req_project = ctk.StringVar(); ctk.CTkEntry(filter_frame, textvariable=self.search_req_project, placeholder_text="Project...", font=("Arial", 14), width=180).pack(side="left", padx=5)
        ctk.CTkButton(filter_frame, text="Search", font=("Arial", 14, "bold"), command=self.load_clients, width=90).pack(side="left", padx=10)
        ctk.CTkButton(filter_frame, text="Clear", font=("Arial", 14, "bold"), fg_color="gray", command=self.clear_client_filters, width=90).pack(side="left", padx=5)
        
        ctk.CTkButton(filter_frame, text="🗑 Delete Selected Client", font=("Arial", 14, "bold"), fg_color="red", command=self.confirm_delete_client).pack(side="right", padx=15)
        ctk.CTkButton(filter_frame, text="📊 Export Clients", font=("Arial", 14, "bold"), fg_color="#107c41", hover_color="#0b5e30", command=self.export_clients_excel).pack(side="right", padx=5)

        columns = ("ID", "Name", "Phone", "Address", "Activity", "Project", "Notes")
        self.client_tree = ttk.Treeview(self.tab_clients, columns=columns, show="headings")
        self.make_treeview_sortable(self.client_tree)
        for col in columns: self.client_tree.column(col, anchor="center", width=100)
        self.client_tree.column("Notes", width=200)
        self.client_tree.pack(fill="both", expand=True, padx=40, pady=10); self.load_clients()

    def view_client_profile(self):
        selected = self.client_tree.selection()
        if not selected: return messagebox.showwarning("Warning", "Please select a client from the table first!")
        
        values = self.client_tree.item(selected[0])['values']
        c_id, client_name = values[0], values[1]

        profile_win = ctk.CTkToplevel(self)
        profile_win.title(f"360° Profile: {client_name}")
        profile_win.geometry("900x650")
        profile_win.transient(self)
        profile_win.configure(fg_color="#0f172a")

        ctk.CTkLabel(profile_win, text=f"🌟 {client_name} - Comprehensive Dashboard", font=("Arial", 24, "bold"), text_color="#00BFFF").pack(pady=15)

        stats_frame = ctk.CTkFrame(profile_win, fg_color="transparent")
        stats_frame.pack(fill="x", padx=20, pady=10)
        
        conn = sqlite3.connect(DB_PATH, timeout=20)
        df = pd.read_sql_query("SELECT project_name, client_price, paid_amount, remaining_amount, status, deadline FROM pricing_records WHERE client_name=?", conn, params=(client_name,))
        client_notes = conn.cursor().execute("SELECT notes FROM clients WHERE id=?", (c_id,)).fetchone()
        client_notes_val = client_notes[0] if client_notes and client_notes[0] else ""
        conn.close()

        total_projs = len(df)
        total_val = df['client_price'].sum() if not df.empty else 0
        total_paid = df['paid_amount'].sum() if not df.empty else 0
        total_rem = df['remaining_amount'].sum() if not df.empty else 0

        def create_card(parent, title, val, color):
            f = ctk.CTkFrame(parent, fg_color="#1e293b", corner_radius=10, border_width=1, border_color=color)
            f.pack(side="left", fill="both", expand=True, padx=5, ipady=10)
            ctk.CTkLabel(f, text=title, font=("Arial", 14, "bold"), text_color=color).pack()
            ctk.CTkLabel(f, text=val, font=("Arial", 20, "bold")).pack()

        create_card(stats_frame, "Total Projects", str(total_projs), "#17a2b8")
        create_card(stats_frame, "Total Value", f"{self.format_money(total_val)} EGP", "#ffc107")
        create_card(stats_frame, "Total Paid", f"{self.format_money(total_paid)} EGP", "#28a745")
        create_card(stats_frame, "Total Remaining", f"{self.format_money(total_rem)} EGP", "#dc3545")

        ctk.CTkLabel(profile_win, text="📚 Client Projects History:", font=("Arial", 16, "bold")).pack(anchor="w", padx=20, pady=(10,0))
        
        p_cols = ("Project", "Price", "Paid", "Remaining", "Status", "Deadline")
        p_tree = ttk.Treeview(profile_win, columns=p_cols, show="headings", height=6)
        for c in p_cols: p_tree.heading(c, text=c); p_tree.column(c, anchor="center")
        p_tree.column("Project", width=250)
        p_tree.pack(fill="x", padx=20, pady=5)
        
        for _, row in df.iterrows():
            p_tree.insert("", "end", values=(row['project_name'], self.format_money(row['client_price']), self.format_money(row['paid_amount']), self.format_money(row['remaining_amount']), row['status'], row['deadline']))

        ctk.CTkLabel(profile_win, text="📝 Special Notes for this Client:", font=("Arial", 16, "bold")).pack(anchor="w", padx=20, pady=(10,0))
        notes_box = ctk.CTkTextbox(profile_win, height=80, font=("Arial", 14))
        notes_box.pack(fill="x", padx=20, pady=5)
        notes_box.insert("1.0", client_notes_val)

        def save_c_notes():
            new_notes = notes_box.get("1.0", "end-1c").strip()
            self.execute_local_and_queue_sync("UPDATE clients SET notes=? WHERE id=?", (new_notes, c_id))
            self.load_clients()
            messagebox.showinfo("Success", "Client Notes Saved!", parent=profile_win)

        ctk.CTkButton(profile_win, text="💾 Save Notes", font=("Arial", 16, "bold"), fg_color="#28a745", hover_color="#218838", command=save_c_notes).pack(pady=10)

    def clear_client_fields(self):
        for e in self.client_entries.values(): e.delete(0, 'end')
        self.client_notes.delete(0, 'end')

    def confirm_delete_client(self):
        if not self.client_tree.selection(): return messagebox.showwarning("Warning", "Select a client to delete!")
        self.verify_action_with_password(self.execute_delete_client)

    def execute_delete_client(self):
        selected = self.client_tree.selection(); c_id = self.client_tree.item(selected[0])['values'][0]
        self.execute_local_and_queue_sync("DELETE FROM clients WHERE id=?", (c_id,))
        self.load_clients(); self.refresh_all_dropdowns(); messagebox.showinfo("Success", "Client deleted successfully.")

    def add_client(self):
        data = [e.get().strip() for e in self.client_entries.values()]
        if not data[0]: return messagebox.showwarning("Warning", "Please fill in at least the Client's Name!")
        data.append(self.client_proj_combo.get())
        notes_val = self.client_notes.get().strip()
        data.append(notes_val)
        
        self.execute_local_and_queue_sync("INSERT INTO clients (name, phone, address, activity, project, notes) VALUES (?, ?, ?, ?, ?, ?)", tuple(data))
        self.clear_client_fields()
        self.load_clients(); self.refresh_all_dropdowns()

    def clear_client_filters(self): self.search_client_name.set(""); self.search_req_project.set(""); self.load_clients()

    def load_clients(self):
        for row in self.client_tree.get_children(): self.client_tree.delete(row)
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            n_filter = f"%{self.search_client_name.get()}%" if hasattr(self, 'search_client_name') else "%"
            p_filter = f"%{self.search_req_project.get()}%" if hasattr(self, 'search_req_project') else "%"
            for row in conn.cursor().execute("SELECT id, name, phone, address, activity, project, notes FROM clients WHERE name LIKE ? AND project LIKE ?", (n_filter, p_filter)).fetchall(): 
                self.client_tree.insert("", "end", values=row)
        except Exception: pass
        finally: conn.close()

    def export_clients_excel(self):
        if self.privacy_mode:
            return messagebox.showerror("Access Denied", "Data export is locked! Please click the 👁️ button and enter the Master Password first.")
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            n_filter = f"%{self.search_client_name.get()}%"
            p_filter = f"%{self.search_req_project.get()}%"
            df = pd.read_sql_query("SELECT * FROM clients WHERE name LIKE ? AND project LIKE ?", conn, params=(n_filter, p_filter))
            conn.close()
            df.to_excel("Fratelanza_Clients_Export.xlsx", index=False)
            messagebox.showinfo("Success", "Clients exported successfully!")
        except Exception as e: messagebox.showerror("Error", f"Failed to export: {e}")

    # ================= Reports Tab & Project Editing =================
    def setup_reports_tab(self):
        top_frame = ctk.CTkFrame(self.tab_reports, fg_color="transparent"); top_frame.pack(pady=20, fill="x", padx=40)
        ctk.CTkLabel(top_frame, text="Search Project:", font=("Arial", 16, "bold")).pack(side="left", padx=5)
        self.rep_search_proj = ctk.StringVar(); ctk.CTkEntry(top_frame, textvariable=self.rep_search_proj, width=150, font=("Arial", 14)).pack(side="left", padx=5)
        ctk.CTkButton(top_frame, text="🔍 Filter", font=("Arial", 16, "bold"), height=40, command=self.load_reports).pack(side="left", padx=15)
        
        self.rep_eye_btn = ctk.CTkButton(top_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.rep_eye_btn.pack(side="left", padx=15)
        self.eye_buttons.append(self.rep_eye_btn)
        
        ctk.CTkButton(top_frame, text="✏️ Edit Record", font=("Arial", 16, "bold"), fg_color="#ffc107", hover_color="#e0a800", text_color="black", height=40, command=self.edit_report_record).pack(side="right", padx=10)
        ctk.CTkButton(top_frame, text="🗑 Delete Selected Record", font=("Arial", 16, "bold"), fg_color="red", height=40, command=self.confirm_delete_report).pack(side="right", padx=10)
        ctk.CTkButton(top_frame, text="📊 Export Full ERP (All Data)", font=("Arial", 16, "bold"), fg_color="#107c41", command=self.export_to_excel).pack(side="right", padx=10)

        # Added "Cost" column to easily spot anomalies
        columns = ("ID", "Type", "Project", "Client", "Price", "Cost", "Paid", "Remaining", "Status", "Next Pay")
        self.report_tree = ttk.Treeview(self.tab_reports, columns=columns, show="headings")
        self.make_treeview_sortable(self.report_tree)
        for col in columns: self.report_tree.column(col, anchor="center", width=100)
        self.report_tree.column("Project", width=200)
        self.report_tree.pack(fill="both", expand=True, padx=40, pady=20)
        self.load_reports()

    def edit_report_record(self):
        selected = self.report_tree.selection()
        if not selected: return messagebox.showwarning("Warning", "Select a record to edit!")
        if self.privacy_mode: return messagebox.showinfo("Locked", "Please unlock data 👁️ first to edit.")
        
        r_id = self.report_tree.item(selected[0])['values'][0]
        
        conn = sqlite3.connect(DB_PATH, timeout=20)
        row = conn.cursor().execute("SELECT project_name, client_price, paid_amount, next_payment_date, status, notes FROM pricing_records WHERE id=?", (r_id,)).fetchone()
        conn.close()
        if not row: return
        
        proj_name, price, paid, next_d, status, notes = row
        price = price or 0; paid = paid or 0
        
        edit_win = ctk.CTkToplevel(self)
        edit_win.title("Edit Project Details")
        edit_win.geometry("500x550")
        edit_win.transient(self)
        edit_win.grab_set()
        edit_win.configure(fg_color="#0f172a")

        ctk.CTkLabel(edit_win, text=f"✏️ Editing: {proj_name}", font=("Arial", 18, "bold"), text_color="#00BFFF").pack(pady=10)

        ctk.CTkLabel(edit_win, text="Total Price (EGP):", font=("Arial", 14, "bold")).pack()
        ent_price = ctk.CTkEntry(edit_win, font=("Arial", 16, "bold")); ent_price.pack(pady=5); ent_price.insert(0, str(price))

        ctk.CTkLabel(edit_win, text="Paid Amount (EGP):", font=("Arial", 14, "bold"), text_color="#28a745").pack()
        ent_paid = ctk.CTkEntry(edit_win, font=("Arial", 16, "bold")); ent_paid.pack(pady=5); ent_paid.insert(0, str(paid))

        ctk.CTkLabel(edit_win, text="Status:", font=("Arial", 14, "bold")).pack()
        combo_status = ctk.CTkComboBox(edit_win, values=["Ongoing", "Completed", "Cancelled", "Paused"], font=("Arial", 14)); combo_status.pack(pady=5)
        combo_status.set(status if status else "Ongoing")

        ctk.CTkLabel(edit_win, text="Next Payment Date (YYYY-MM-DD):", font=("Arial", 14, "bold")).pack()
        ent_date = ctk.CTkEntry(edit_win, font=("Arial", 14)); ent_date.pack(pady=5); ent_date.insert(0, str(next_d) if next_d else "")

        ctk.CTkLabel(edit_win, text="Notes:", font=("Arial", 14, "bold")).pack()
        txt_notes = ctk.CTkTextbox(edit_win, height=60, font=("Arial", 14)); txt_notes.pack(pady=5)
        txt_notes.insert("1.0", str(notes) if notes else "")

        def save_proj_edits():
            new_p = float(ent_price.get() or 0)
            new_paid = float(ent_paid.get() or 0)
            new_rem = new_p - new_paid
            new_stat = combo_status.get()
            new_dt = ent_date.get()
            new_nts = txt_notes.get("1.0", "end-1c").strip()
            
            self.execute_local_and_queue_sync("UPDATE pricing_records SET client_price=?, paid_amount=?, remaining_amount=?, status=?, next_payment_date=?, notes=? WHERE id=?", 
                                              (new_p, new_paid, new_rem, new_stat, new_dt, new_nts, r_id))
            self.load_reports()
            self.load_receivables()
            if hasattr(self, 'load_tasks'): self.load_tasks()
            edit_win.destroy()
            messagebox.showinfo("Success", "Project updated successfully.")

        ctk.CTkButton(edit_win, text="💾 Save Updates", font=("Arial", 16, "bold"), fg_color="#28a745", command=save_proj_edits).pack(pady=15)

    def confirm_delete_report(self):
        if not self.report_tree.selection(): return messagebox.showwarning("Warning", "Select a record to delete!")
        self.verify_action_with_password(self.execute_delete_report)

    def execute_delete_report(self):
        selected = self.report_tree.selection(); r_id = self.report_tree.item(selected[0])['values'][0]
        self.execute_local_and_queue_sync("DELETE FROM pricing_records WHERE id=?", (r_id,))
        self.load_reports()
        self.load_receivables()
        if hasattr(self, 'load_software_projects'): self.load_software_projects()
        if hasattr(self, 'load_tasks'): self.load_tasks()
        self.refresh_finance_data(use_dates=False); messagebox.showinfo("Success", "Record deleted successfully.")

    def load_reports(self):
        for row in self.report_tree.get_children(): self.report_tree.delete(row)

        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            p_filter = f"%{self.rep_search_proj.get()}%" if hasattr(self, 'rep_search_proj') else "%"
            query = "SELECT id, type, project_name, client_name, client_price, total_cost, paid_amount, remaining_amount, status, next_payment_date FROM pricing_records WHERE project_name LIKE ?"
            for row in conn.cursor().execute(query, (p_filter,)).fetchall(): 
                f_row = list(row)
                f_row[4] = self.format_money(f_row[4])
                f_row[5] = self.format_money(f_row[5]) # Added cost tracking
                f_row[6] = self.format_money(f_row[6] if f_row[6] else 0)
                f_row[7] = self.format_money(f_row[7] if f_row[7] else 0)
                self.report_tree.insert("", "end", values=f_row)
        except Exception: pass
        finally: conn.close()

    def export_to_excel(self):
        if self.privacy_mode:
            return messagebox.showerror("Access Denied", "Data export is locked! Please click the 👁️ button and enter the Master Password first.")
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            df_reports = pd.read_sql_query("SELECT * FROM pricing_records", conn)
            df_freelancers = pd.read_sql_query("SELECT * FROM freelancers", conn)
            df_clients = pd.read_sql_query("SELECT * FROM clients", conn)
            df_expenses = pd.read_sql_query("SELECT * FROM general_expenses", conn)
            df_services = pd.read_sql_query("SELECT * FROM templates", conn)
            df_quotes = pd.read_sql_query("SELECT * FROM sales_quotes", conn)
            conn.close()

            with pd.ExcelWriter("Fratelanza_Full_Master_Database.xlsx", engine="openpyxl") as writer:
                if not df_reports.empty: df_reports.to_excel(writer, sheet_name="All Financial Reports", index=False)
                if not df_freelancers.empty: df_freelancers.to_excel(writer, sheet_name="Freelancers Directory", index=False)
                if not df_clients.empty: df_clients.to_excel(writer, sheet_name="Clients & Projects", index=False)
                if not df_expenses.empty: df_expenses.to_excel(writer, sheet_name="Operating Expenses", index=False)
                if not df_services.empty: df_services.to_excel(writer, sheet_name="Services & Templates", index=False)
                if not df_quotes.empty: df_quotes.to_excel(writer, sheet_name="Sales Quotes", index=False)
            messagebox.showinfo("Success", "Master Database exported successfully!\nIncludes Reports, Expenses, Clients, Services, Quotes, and Freelancers.")
        except Exception as e: messagebox.showerror("Error", f"Failed to export: {e}")

    # ================= Receivables Tab (المدفوعات) =================
    def setup_receivables_tab(self):
        top_frame = ctk.CTkFrame(self.tab_receivables, fg_color="transparent"); top_frame.pack(pady=10, fill="x", padx=40)
        ctk.CTkLabel(top_frame, text="متابعة المستحقات والمدفوعات (Expected Revenue)", font=("Arial", 24, "bold"), text_color="#17a2b8").pack(side="left")
        
        ctk.CTkButton(top_frame, text="💰 تسجيل تسديد دفعة (Log Payment)", font=("Arial", 16, "bold"), fg_color="#28a745", hover_color="#218838", height=40, command=self.log_payment).pack(side="right", padx=10)
        ctk.CTkButton(top_frame, text="📊 تصدير Excel", font=("Arial", 16, "bold"), fg_color="#107c41", height=40, command=self.export_receivables_excel).pack(side="right", padx=10)
        
        columns = ("ID", "Client", "Project", "Total Price", "Paid So Far", "Remaining", "Next Payment Date")
        self.receiv_tree = ttk.Treeview(self.tab_receivables, columns=columns, show="headings")
        self.make_treeview_sortable(self.receiv_tree)
        for col in columns: self.receiv_tree.column(col, anchor="center", width=120)
        self.receiv_tree.column("Project", width=250)
        self.receiv_tree.pack(fill="both", expand=True, padx=40, pady=20)
        self.load_receivables()

    def load_receivables(self):
        for row in self.receiv_tree.get_children(): self.receiv_tree.delete(row)
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            query = "SELECT id, client_name, project_name, client_price, paid_amount, remaining_amount, next_payment_date FROM pricing_records WHERE remaining_amount > 0 ORDER BY next_payment_date ASC"
            for row in conn.cursor().execute(query).fetchall(): 
                f_row = list(row)
                f_row[3] = self.format_money(f_row[3])
                f_row[4] = self.format_money(f_row[4] if f_row[4] else 0)
                f_row[5] = self.format_money(f_row[5] if f_row[5] else 0)
                self.receiv_tree.insert("", "end", values=f_row)
        except Exception: pass
        finally: conn.close()

    def log_payment(self):
        selected = self.receiv_tree.selection()
        if not selected: return messagebox.showwarning("Warning", "Select a record to log payment!")
        if self.privacy_mode: return messagebox.showinfo("Locked", "Please unlock data 👁️ first.")
        
        r_id = self.receiv_tree.item(selected[0])['values'][0]
        
        conn = sqlite3.connect(DB_PATH, timeout=20)
        row = conn.cursor().execute("SELECT client_price, paid_amount FROM pricing_records WHERE id=?", (r_id,)).fetchone()
        conn.close()
        if not row: return
        total_p, current_paid = row
        current_paid = current_paid or 0
        rem = total_p - current_paid
        
        pay_win = ctk.CTkToplevel(self)
        pay_win.title("💰 Receive Payment")
        pay_win.geometry("400x300")
        pay_win.transient(self)
        pay_win.grab_set()
        pay_win.configure(fg_color="#0f172a")

        ctk.CTkLabel(pay_win, text=f"Remaining: {rem} EGP", font=("Arial", 18, "bold"), text_color="#dc3545").pack(pady=10)
        ctk.CTkLabel(pay_win, text="Enter Payment Amount (EGP):", font=("Arial", 14, "bold")).pack()
        ent_amt = ctk.CTkEntry(pay_win, font=("Arial", 16, "bold"))
        ent_amt.pack(pady=10)

        ctk.CTkLabel(pay_win, text="Update Next Date (Optional):", font=("Arial", 14, "bold")).pack()
        ent_dt = DateEntry(pay_win, width=15, font=('Arial', 14, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        ent_dt.pack(pady=5)

        def save_pay():
            try: amt_val = float(ent_amt.get())
            except: return messagebox.showwarning("Error", "Enter valid amount.", parent=pay_win)
            
            new_paid = current_paid + amt_val
            new_rem = total_p - new_paid
            new_d = ent_dt.get_date().strftime('%Y-%m-%d')
            
            self.execute_local_and_queue_sync("UPDATE pricing_records SET paid_amount=?, remaining_amount=?, next_payment_date=? WHERE id=?", (new_paid, new_rem, new_d, r_id))
            self.load_receivables(); self.load_reports(); 
            if hasattr(self, 'load_software_projects'): self.load_software_projects()
            pay_win.destroy()
            messagebox.showinfo("Success", "Payment Logged Successfully!")

        ctk.CTkButton(pay_win, text="💾 Confirm Payment", font=("Arial", 16, "bold"), fg_color="#28a745", command=save_pay).pack(pady=10)

    def export_receivables_excel(self):
        if self.privacy_mode: return messagebox.showerror("Access Denied", "Unlock data first.")
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            df = pd.read_sql_query("SELECT id, client_name, project_name, client_price, paid_amount, remaining_amount, next_payment_date FROM pricing_records WHERE remaining_amount > 0 ORDER BY next_payment_date ASC", conn)
            conn.close()
            df.to_excel("Fratelanza_Receivables.xlsx", index=False)
            messagebox.showinfo("Success", "تم تصدير المستحقات بنجاح!")
        except Exception as e: messagebox.showerror("Error", f"Failed: {e}")

    # ================= Sales Quote Tab (Dynamic) =================
    def setup_quote_tab(self):
        self.quote_scroll = ctk.CTkScrollableFrame(self.tab_quote, fg_color="transparent")
        self.quote_scroll.pack(fill="both", expand=True)

        title_frame = ctk.CTkFrame(self.quote_scroll, fg_color="transparent")
        title_frame.pack(pady=10)
        
        ctk.CTkLabel(title_frame, text="Dynamic Sales Quotation Builder", font=("Arial", 28, "bold"), text_color="#00BFFF").pack(side="left")
        
        self.quote_eye_btn = ctk.CTkButton(title_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.quote_eye_btn.pack(side="left", padx=15)
        self.eye_buttons.append(self.quote_eye_btn)

        setup_frame = ctk.CTkFrame(self.quote_scroll)
        setup_frame.pack(pady=10, fill="x", padx=40, ipady=10)
        
        ctk.CTkLabel(setup_frame, text="Select Client:", font=("Arial", 16, "bold")).grid(row=0, column=0, padx=20, pady=10, sticky="e")
        self.quote_client_combo = ctk.CTkComboBox(setup_frame, values=getattr(self, 'client_names_list', ["No Clients Yet"]), font=("Arial", 16, "bold"), width=300)
        self.quote_client_combo.grid(row=0, column=1, padx=20, pady=10)

        ctk.CTkLabel(setup_frame, text="PDF Language:", font=("Arial", 16, "bold")).grid(row=0, column=2, padx=20, pady=10, sticky="e")
        self.quote_lang_combo = ctk.CTkComboBox(setup_frame, values=["English", "Arabic (عربي)"], font=("Arial", 16, "bold"), width=200)
        self.quote_lang_combo.grid(row=0, column=3, padx=20, pady=10)
        
        ctk.CTkLabel(setup_frame, text="Quote Date:", font=("Arial", 16, "bold")).grid(row=0, column=4, padx=20, pady=10, sticky="e")
        self.quote_date_picker = DateEntry(setup_frame, width=15, font=('Arial', 14, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd')
        self.quote_date_picker.grid(row=0, column=5, padx=20, pady=10)

        add_frame = ctk.CTkFrame(self.quote_scroll)
        add_frame.pack(pady=10, fill="x", padx=40, ipady=10)
        
        ctk.CTkLabel(add_frame, text="1. Select Template:", font=("Arial", 14, "bold")).grid(row=0, column=0, padx=10, pady=10)
        self.quote_service_combo = ctk.CTkComboBox(add_frame, values=["Custom..."] + getattr(self, 'all_project_names', []), font=("Arial", 16, "bold"), width=200, command=self.update_quote_price)
        self.quote_service_combo.grid(row=0, column=1, padx=10, pady=10)

        ctk.CTkLabel(add_frame, text="2. Edit Description:", font=("Arial", 14, "bold")).grid(row=0, column=2, padx=10, pady=10)
        self.quote_desc_entry = ctk.CTkEntry(add_frame, placeholder_text="Type service details here...", font=("Arial", 16, "bold"), width=300)
        self.quote_desc_entry.grid(row=0, column=3, padx=10, pady=10)

        ctk.CTkLabel(add_frame, text="3. Edit Price (EGP):", font=("Arial", 14, "bold")).grid(row=0, column=4, padx=10, pady=10)
        self.quote_price_entry = ctk.CTkEntry(add_frame, font=("Arial", 16, "bold"), width=150, validate="key", validatecommand=self.vcmd_num)
        self.quote_price_entry.grid(row=0, column=5, padx=10, pady=10)
        self.apply_live_format(self.quote_price_entry)

        ctk.CTkButton(add_frame, text="➕ Add to Quote", font=("Arial", 16, "bold"), fg_color="#28a745", hover_color="#218838", command=self.add_item_to_quote).grid(row=0, column=6, padx=10, pady=10)
        ctk.CTkButton(add_frame, text="🧹 مسح", font=("Arial", 16, "bold"), fg_color="#6c757d", command=self.clear_quote_item_fields).grid(row=0, column=7, padx=10, pady=10)

        items_frame = ctk.CTkFrame(self.quote_scroll)
        items_frame.pack(pady=10, fill="x", padx=40)
        
        ctk.CTkLabel(items_frame, text="Current Quote Items (Draft)", font=("Arial", 18, "bold"), text_color="#ffc107").pack(pady=5)
        
        cols = ("Service Description", "Price (EGP)")
        self.quote_current_tree = ttk.Treeview(items_frame, columns=cols, show="headings", height=5)
        self.make_treeview_sortable(self.quote_current_tree)
        self.quote_current_tree.column("Service Description", width=600)
        self.quote_current_tree.column("Price (EGP)", width=200, anchor="center")
        self.quote_current_tree.pack(fill="both", expand=True, padx=20, pady=10)

        ctrl_frame = ctk.CTkFrame(items_frame, fg_color="transparent")
        ctrl_frame.pack(fill="x", padx=20, pady=5)
        
        ctk.CTkButton(ctrl_frame, text="🗑 Remove Selected Item", font=("Arial", 14, "bold"), fg_color="red", width=150, command=self.remove_item_from_quote).pack(side="left")
        ctk.CTkButton(ctrl_frame, text="✏️ Edit Selected Item", font=("Arial", 14, "bold"), fg_color="#ffc107", hover_color="#e0a800", text_color="black", width=150, command=self.edit_item_in_quote).pack(side="left", padx=10)
        
        self.quote_total_lbl = ctk.CTkLabel(ctrl_frame, text="Total Quote Price: 0 EGP", font=("Arial", 22, "bold"), text_color="#17a2b8")
        self.quote_total_lbl.pack(side="right")

        extras_frame = ctk.CTkFrame(self.quote_scroll, fg_color="transparent")
        extras_frame.pack(pady=10, fill="x", padx=40)
        extras_frame.grid_columnconfigure((0, 1, 2), weight=1)

        ctk.CTkLabel(extras_frame, text="Payment Terms (آليات وشروط الدفع):", font=("Arial", 16, "bold"), text_color="#00BFFF").grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.quote_payment_terms_box = ctk.CTkTextbox(extras_frame, height=80, font=("Arial", 14))
        self.quote_payment_terms_box.grid(row=1, column=0, padx=10, sticky="ew")

        ctk.CTkLabel(extras_frame, text="Milestones (مراحل التسليم والجدول):", font=("Arial", 16, "bold"), text_color="#28a745").grid(row=0, column=1, padx=10, pady=5, sticky="w")
        self.quote_milestones_box = ctk.CTkTextbox(extras_frame, height=80, font=("Arial", 14))
        self.quote_milestones_box.grid(row=1, column=1, padx=10, sticky="ew")

        ctk.CTkLabel(extras_frame, text="Notes (ملاحظات إضافية):", font=("Arial", 16, "bold"), text_color="#ffc107").grid(row=0, column=2, padx=10, pady=5, sticky="w")
        self.quote_notes_box = ctk.CTkTextbox(extras_frame, height=80, font=("Arial", 14))
        self.quote_notes_box.grid(row=1, column=2, padx=10, sticky="ew")

        ctk.CTkButton(self.quote_scroll, text="🖨 Generate & Save Official PDF Quotation", font=("Arial", 20, "bold"), fg_color="#107c41", hover_color="#0b5e30", height=50, width=400, command=self.generate_and_save_quote).pack(pady=20)

        hist_frame = ctk.CTkFrame(self.quote_scroll)
        hist_frame.pack(pady=10, fill="both", expand=True, padx=40)
        
        ctk.CTkLabel(hist_frame, text="Saved Quotes History", font=("Arial", 18, "bold")).pack(pady=5)
        
        filter_frame = ctk.CTkFrame(hist_frame, fg_color="transparent")
        filter_frame.pack(pady=5, fill="x", padx=20)
        self.search_quote_client = ctk.StringVar(); ctk.CTkEntry(filter_frame, textvariable=self.search_quote_client, placeholder_text="Client Name...", font=("Arial", 14), width=180).pack(side="left", padx=5)
        self.search_quote_proj = ctk.StringVar(); ctk.CTkEntry(filter_frame, textvariable=self.search_quote_proj, placeholder_text="Details...", font=("Arial", 14), width=180).pack(side="left", padx=5)
        ctk.CTkButton(filter_frame, text="Search", font=("Arial", 14, "bold"), command=self.load_quotes, width=90).pack(side="left", padx=5)
        ctk.CTkButton(filter_frame, text="Clear", font=("Arial", 14, "bold"), fg_color="gray", command=self.clear_quote_filters, width=90).pack(side="left", padx=5)
        ctk.CTkButton(filter_frame, text="🗑 Delete Quote", font=("Arial", 14, "bold"), fg_color="red", command=self.confirm_delete_quote).pack(side="right", padx=5)
        ctk.CTkButton(filter_frame, text="✏️ Edit Saved Quote", font=("Arial", 14, "bold"), fg_color="#ffc107", hover_color="#e0a800", text_color="black", command=self.edit_saved_quote).pack(side="right", padx=5)
        ctk.CTkButton(filter_frame, text="📊 تصدير Excel", font=("Arial", 14, "bold"), fg_color="#107c41", command=self.export_quotes_excel).pack(side="right", padx=5)

        h_cols = ("ID", "Client Name", "Quote Details", "Total Price", "Language", "Date")
        self.quote_tree = ttk.Treeview(hist_frame, columns=h_cols, show="headings", height=8)
        self.make_treeview_sortable(self.quote_tree)
        for c in h_cols: self.quote_tree.column(c, anchor="center")
        self.quote_tree.column("Quote Details", width=400)
        self.quote_tree.pack(fill="both", expand=True, padx=20, pady=10)
        self.load_quotes()
        self.quote_tree.bind('<Double-1>', self.double_click_quote)

    def export_quotes_excel(self):
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            df = pd.read_sql_query("SELECT * FROM sales_quotes", conn)
            conn.close()
            df.to_excel("Fratelanza_Quotes.xlsx", index=False)
            messagebox.showinfo("Success", "تم تصدير عروض الأسعار بنجاح!")
        except Exception as e: messagebox.showerror("Error", f"Failed: {e}")

    def clear_quote_item_fields(self):
        self.quote_desc_entry.delete(0, 'end')
        self.quote_price_entry.delete(0, 'end')
        self.quote_service_combo.set("Custom...")

    def update_quote_price(self, choice):
        if choice == "Custom...":
            self.quote_desc_entry.delete(0, 'end'); self.quote_price_entry.delete(0, 'end'); return
            
        self.quote_desc_entry.delete(0, 'end'); self.quote_desc_entry.insert(0, choice)
        
        if hasattr(self, 'software_projects') and choice in self.software_projects:
            price = self.software_projects[choice].get("price", 0)
            self.quote_price_entry.delete(0, 'end'); self.quote_price_entry.insert(0, self.format_num(price))
        elif hasattr(self, 'training_projects') and choice in self.training_projects:
            price = self.training_projects[choice].get("trainee_cost", 0)
            self.quote_price_entry.delete(0, 'end'); self.quote_price_entry.insert(0, self.format_num(price))

    def update_quote_total(self):
        total = 0.0
        for child in self.quote_current_tree.get_children():
            price_str = str(self.quote_current_tree.item(child)['values'][1]).replace(',', '')
            try: total += float(price_str)
            except: pass
        self.quote_total_lbl.configure(text=f"Total Quote Price: {self.format_num(total)} EGP")

    def add_item_to_quote(self):
        desc = self.quote_desc_entry.get().strip()
        price = self.quote_price_entry.get().replace(',', '').strip()
        
        if not desc: return messagebox.showwarning("Warning", "Please enter a service description.")
        if not price or float(price) < 0: return messagebox.showwarning("Warning", "Please enter a valid price.")
        
        self.quote_current_tree.insert("", "end", values=(desc, self.format_num(price)))
        self.update_quote_total()
        self.clear_quote_item_fields()

    def remove_item_from_quote(self):
        selected = self.quote_current_tree.selection()
        if not selected: return messagebox.showwarning("Warning", "Select an item to remove.")
        for s in selected: self.quote_current_tree.delete(s)
        self.update_quote_total()

    def edit_item_in_quote(self):
        selected = self.quote_current_tree.selection()
        if not selected: 
            return messagebox.showwarning("Warning", "Select an item to edit.")
        
        item_id = selected[0]
        desc, price_str = self.quote_current_tree.item(item_id)['values']

        self.quote_desc_entry.delete(0, 'end')
        self.quote_desc_entry.insert(0, desc)

        self.quote_price_entry.delete(0, 'end')
        clean_price = str(price_str).replace(',', '').replace(' EGP', '').strip()
        self.quote_price_entry.insert(0, clean_price)

        self.quote_service_combo.set("Custom...")

        self.quote_current_tree.delete(item_id)
        self.update_quote_total()

    def clear_quote_filters(self):
        self.search_quote_client.set(""); self.search_quote_proj.set(""); self.load_quotes()

    def load_quotes(self):
        for row in self.quote_tree.get_children(): self.quote_tree.delete(row)
        conn = sqlite3.connect(DB_PATH, timeout=20)
        try:
            c_filter = f"%{self.search_quote_client.get()}%" if hasattr(self, 'search_quote_client') else "%"
            p_filter = f"%{self.search_quote_proj.get()}%" if hasattr(self, 'search_quote_proj') else "%"
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM sales_quotes WHERE client_name LIKE ? AND project_name LIKE ?", (c_filter, p_filter))
            for row in cursor.fetchall(): 
                f_row = list(row); f_row[3] = self.format_num(f_row[3])
                self.quote_tree.insert("", "end", values=f_row)
        finally: conn.close()

    def double_click_quote(self, event):
        selected = self.quote_tree.selection()
        if not selected: 
            return
        
        if self.privacy_mode:
            return messagebox.showinfo("Locked", "Please unlock data 👁️ first to edit quotes.")

        values = self.quote_tree.item(selected[0])['values']
        q_id = values[0]
        client_name = values[1]
        quote_details = values[2]
        total_price = str(values[3]).replace(',', '')
        language = values[4]
        q_date = values[5]

        self.editing_quote_id = q_id
        self.quote_client_combo.set(client_name)
        self.quote_lang_combo.set(language)

        try:
            just_date = q_date.split()[0]
            dt = datetime.strptime(just_date, '%Y-%m-%d')
            self.quote_date_picker.set_date(dt)
        except: pass

        for child in self.quote_current_tree.get_children():
            self.quote_current_tree.delete(child)
            
        self.quote_current_tree.insert("", "end", values=(quote_details, self.format_num(total_price)))
        self.update_quote_total()

        messagebox.showinfo("Edit Mode Active", f"🔄 تم تحميل عرض السعر للتعديل.\nتقدر تعدل براحتي وتضغط Generate & Save للحفظ والتحديث.")

    def confirm_delete_quote(self):
        if not self.quote_tree.selection(): return messagebox.showwarning("Warning", "Select a quote from history to delete!")
        self.verify_action_with_password(self.execute_delete_quote)

    def execute_delete_quote(self):
        selected = self.quote_tree.selection(); q_id = self.quote_tree.item(selected[0])['values'][0]
        self.execute_local_and_queue_sync("DELETE FROM sales_quotes WHERE id=?", (q_id,))
        self.load_quotes(); messagebox.showinfo("Success", "Quote deleted successfully.")

    def edit_saved_quote(self):
        selected = self.quote_tree.selection()
        if not selected: 
            return messagebox.showwarning("Warning", "Select a quote from history to edit!")
            
        if self.privacy_mode:
            return messagebox.showinfo("Locked", "Please unlock data 👁️ first to edit quotes.")

        values = self.quote_tree.item(selected[0])['values']
        q_id = values[0]
        current_desc = values[2]
        current_price = values[3]

        edit_win = ctk.CTkToplevel(self)
        edit_win.title("Edit Saved Quote")
        edit_win.geometry("550x350")
        edit_win.transient(self)
        edit_win.grab_set()
        edit_win.configure(fg_color="#0f172a")

        ctk.CTkLabel(edit_win, text="✏️ Edit Quote Details", font=("Arial", 20, "bold"), text_color="#00BFFF").pack(pady=15)

        ctk.CTkLabel(edit_win, text="Project Description:", font=("Arial", 14, "bold"), text_color="white").pack(pady=5)
        desc_entry = ctk.CTkEntry(edit_win, font=("Arial", 14), width=450)
        desc_entry.pack(pady=5)
        desc_entry.insert(0, current_desc)

        ctk.CTkLabel(edit_win, text="Total Price (EGP):", font=("Arial", 14, "bold"), text_color="white").pack(pady=5)
        price_entry = ctk.CTkEntry(edit_win, font=("Arial", 16, "bold"), width=200, validate="key", validatecommand=self.vcmd_num)
        price_entry.pack(pady=5)
        price_entry.insert(0, str(current_price).replace(',', ''))
        self.apply_live_format(price_entry)

        def save_edits():
            new_desc = desc_entry.get().strip()
            new_price = float(price_entry.get().replace(',', '') or 0)
            
            if not new_desc:
                return messagebox.showwarning("Warning", "Description cannot be empty.", parent=edit_win)

            self.execute_local_and_queue_sync(
                "UPDATE sales_quotes SET project_name=?, price=? WHERE id=?", 
                (new_desc, new_price, q_id)
            )
            self.load_quotes()
            edit_win.destroy()
            messagebox.showinfo("Success", "Quote updated successfully in Database.")

        btn_frame = ctk.CTkFrame(edit_win, fg_color="transparent")
        btn_frame.pack(pady=20)
        ctk.CTkButton(btn_frame, text="💾 Save Changes", font=("Arial", 16, "bold"), fg_color="#28a745", hover_color="#218838", command=save_edits).pack(side="left", padx=10)
        ctk.CTkButton(btn_frame, text="Cancel", font=("Arial", 16, "bold"), fg_color="gray", command=edit_win.destroy).pack(side="left", padx=10)

    def generate_and_save_quote(self):
        client = self.quote_client_combo.get()
        lang = self.quote_lang_combo.get()
        
        quote_date = self.quote_date_picker.get_date().strftime('%Y-%m-%d') if hasattr(self, 'quote_date_picker') else datetime.now().strftime('%Y-%m-%d')
        payment_terms = self.quote_payment_terms_box.get("1.0", "end-1c").strip() if hasattr(self, 'quote_payment_terms_box') else ""
        milestones = self.quote_milestones_box.get("1.0", "end-1c").strip() if hasattr(self, 'quote_milestones_box') else ""
        notes = self.quote_notes_box.get("1.0", "end-1c").strip() if hasattr(self, 'quote_notes_box') else ""
        
        if not client or client == "No Clients Yet": return messagebox.showwarning("Warning", "Select a valid client.")
        
        items = []
        total_price = 0.0
        for child in self.quote_current_tree.get_children():
            desc, price_str = self.quote_current_tree.item(child)['values']
            p_val = float(str(price_str).replace(',', ''))
            items.append((desc, p_val)); total_price += p_val
            
        if not items: return messagebox.showwarning("Warning", "Your quote is empty! Add items first.")

        try:
            date_today = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
            summary_desc = " + ".join([i[0] for i in items])
            if len(summary_desc) > 200: summary_desc = f"{len(items)} Items Included"
            
            editing_id = getattr(self, 'editing_quote_id', None)
            
            if editing_id:
                q_update = "UPDATE sales_quotes SET client_name=?, project_name=?, price=?, language=?, date=? WHERE id=?"
                p_update = (client, summary_desc, total_price, lang, date_today, editing_id)
                self.execute_local_and_queue_sync(q_update, p_update)
                self.editing_quote_id = None 
            else:
                self.execute_local_and_queue_sync("INSERT INTO sales_quotes (client_name, project_name, price, language, date) VALUES (?, ?, ?, ?, ?)", (client, summary_desc, total_price, lang, date_today))
                
            self.load_quotes()

            date_str = datetime.now().strftime('%Y-%m-%d')
            safe_client_name = "".join([c for c in client if c.isalnum() or c in (' ', '_', '-')]).rstrip()
            if not safe_client_name: safe_client_name = "Unknown_Client"
            
            client_dir = os.path.join(BASE_DIR, "Sales_Quotes", safe_client_name)
            date_dir = os.path.join(client_dir, date_str)
            if not os.path.exists(date_dir): os.makedirs(date_dir)

            pdf = FPDF()
            pdf.add_page()
            
            has_arabic_font = False
            if os.path.exists(FONT_PATH):
                try:
                    pdf.add_font('ArialCustom', '', FONT_PATH, uni=True)
                    has_arabic_font = True
                except TypeError:
                    try:
                        pdf.add_font('ArialCustom', '', FONT_PATH)
                        has_arabic_font = True
                    except: pass
                except: pass

            if lang == "English":
                if os.path.exists(LOGO_PATH): pdf.image(LOGO_PATH, x=150, y=8, w=45) 
                
                pdf.set_font('Helvetica', 'B', 32); pdf.set_text_color(10, 25, 47); pdf.cell(0, 15, "Fratelanza", ln=True, align='L')
                pdf.set_font('Helvetica', '', 12); pdf.set_text_color(100, 100, 100); pdf.cell(0, 8, f"Tax Reg No: {self.tax_id}", ln=True, align='L')
                pdf.set_y(40); pdf.set_draw_color(0, 191, 255); pdf.set_line_width(1.0); pdf.line(10, pdf.get_y(), 200, pdf.get_y()); pdf.set_line_width(0.2); pdf.ln(10)
                
                pdf.set_font('Helvetica', 'I', 16); pdf.set_text_color(100, 100, 100); pdf.cell(0, 10, "Official Sales Quotation", ln=True, align='L')
                pdf.set_font('Helvetica', 'B', 14); pdf.set_text_color(0, 0, 0)
                pdf.cell(40, 10, "Date:", align='L'); pdf.set_font('Helvetica', '', 14); pdf.cell(100, 10, quote_date, ln=True, align='L')
                pdf.set_font('Helvetica', 'B', 14); pdf.cell(40, 10, "Prepared For:", align='L'); pdf.set_font('Helvetica', '', 14); pdf.cell(100, 10, client, ln=True, align='L')
                
                pdf.ln(15); pdf.set_fill_color(0, 191, 255); pdf.set_text_color(255, 255, 255); pdf.set_font('Helvetica', 'B', 16)
                pdf.cell(130, 15, " Service / Project Description", border=1, fill=True); pdf.cell(60, 15, " Price (EGP)", border=1, fill=True, align='C', ln=True)
                
                pdf.set_text_color(0, 0, 0); pdf.set_font('Helvetica', '', 16)
                for desc, p_val in items:
                    pdf.cell(130, 15, f" {desc}", border=1); pdf.cell(60, 15, f"{self.format_num(p_val)} EGP", border=1, align='C', ln=True)
                
                pdf.set_font('Helvetica', 'B', 16); pdf.set_fill_color(240, 248, 255)
                pdf.cell(130, 15, " TOTAL", border=1, align='R', fill=True); pdf.cell(60, 15, f"{self.format_num(total_price)} EGP", border=1, align='C', ln=True, fill=True)
                
                if payment_terms:
                    pdf.ln(5)
                    pdf.set_font('Helvetica', 'B', 14); pdf.set_text_color(0, 191, 255)
                    pdf.cell(0, 10, "Payment Terms:", ln=True, align='L')
                    pdf.set_font('Helvetica', '', 12); pdf.set_text_color(0, 0, 0)
                    pdf.multi_cell(0, 8, payment_terms)

                if milestones:
                    pdf.ln(5)
                    pdf.set_font('Helvetica', 'B', 14); pdf.set_text_color(40, 167, 69)
                    pdf.cell(0, 10, "Project Milestones & Delivery:", ln=True, align='L')
                    pdf.set_font('Helvetica', '', 12); pdf.set_text_color(0, 0, 0)
                    pdf.multi_cell(0, 8, milestones)

                if notes:
                    pdf.ln(5)
                    pdf.set_font('Helvetica', 'B', 14); pdf.set_text_color(255, 193, 7)
                    pdf.cell(0, 10, "Additional Notes:", ln=True, align='L')
                    pdf.set_font('Helvetica', '', 12); pdf.set_text_color(0, 0, 0)
                    pdf.multi_cell(0, 8, notes)
                
                pdf.ln(15); pdf.set_font('Helvetica', 'I', 12); pdf.set_text_color(100, 100, 100)
                pdf.cell(0, 8, "Thank you for trusting Fratelanza!", ln=True)
                pdf.cell(0, 8, "This quotation is valid for 14 days from the date of issuance.", ln=True)
                
            else: # Arabic Layout
                if not has_arabic_font:
                    return messagebox.showerror("Font Error", "Arabic Font (arial.ttf) not found!\nPlease copy 'arial.ttf' to the app folder to print Arabic PDFs.")
                def ar(text): return get_display(arabic_reshaper.reshape(text))
                
                if os.path.exists(LOGO_PATH): pdf.image(LOGO_PATH, x=15, y=8, w=45) 
                pdf.set_font('ArialCustom', '', 32); pdf.set_text_color(10, 25, 47); pdf.cell(0, 15, ar("فراتيلانزا"), ln=True, align='R')
                pdf.set_font('ArialCustom', '', 12); pdf.set_text_color(100, 100, 100); pdf.cell(0, 8, ar(f"رقم التسجيل الضريبي: {self.tax_id}"), ln=True, align='R')
                pdf.set_y(40); pdf.set_draw_color(0, 191, 255); pdf.set_line_width(1.0); pdf.line(10, pdf.get_y(), 200, pdf.get_y()); pdf.set_line_width(0.2); pdf.ln(10)
                
                pdf.set_font('ArialCustom', '', 18); pdf.set_text_color(100, 100, 100); pdf.cell(0, 10, ar("عرض سعر رسمي"), ln=True, align='R')
                pdf.set_font('ArialCustom', '', 14); pdf.set_text_color(0, 0, 0)
                pdf.cell(0, 10, ar(f"التاريخ: {quote_date}"), ln=True, align='R')
                pdf.cell(0, 10, ar(f"مقدم إلى السيد/الشركة: {client}"), ln=True, align='R')
                
                pdf.ln(15); pdf.set_fill_color(0, 191, 255); pdf.set_text_color(255, 255, 255); pdf.set_font('ArialCustom', '', 16)
                pdf.cell(60, 15, ar("السعر (جنيه مصري)"), border=1, fill=True, align='C'); pdf.cell(130, 15, ar("وصف الخدمة / المشروع"), border=1, fill=True, align='C', ln=True)
                
                pdf.set_text_color(0, 0, 0); pdf.set_font('ArialCustom', '', 16)
                for desc, p_val in items:
                    pdf.cell(60, 15, ar(f"{self.format_num(p_val)} ج.م"), border=1, align='C'); pdf.cell(130, 15, ar(f"{desc}"), border=1, align='C', ln=True)
                    
                pdf.set_font('ArialCustom', '', 16); pdf.set_fill_color(240, 248, 255)
                pdf.cell(60, 15, ar(f"{self.format_num(total_price)} ج.م"), border=1, align='C', fill=True); pdf.cell(130, 15, ar("الإجمــــالـــي"), border=1, align='C', ln=True, fill=True)
                
                if payment_terms:
                    pdf.ln(5); pdf.set_font('ArialCustom', '', 16); pdf.set_text_color(0, 191, 255)
                    pdf.cell(0, 10, ar("آليات وشروط الدفع:"), ln=True, align='R')
                    pdf.set_font('ArialCustom', '', 14); pdf.set_text_color(0, 0, 0)
                    for term_line in payment_terms.split('\n'):
                        if term_line.strip():
                            pdf.cell(0, 8, ar(term_line.strip()), ln=True, align='R')

                if milestones:
                    pdf.ln(5); pdf.set_font('ArialCustom', '', 16); pdf.set_text_color(40, 167, 69)
                    pdf.cell(0, 10, ar("مراحل التسليم والجدول الزمني:"), ln=True, align='R')
                    pdf.set_font('ArialCustom', '', 14); pdf.set_text_color(0, 0, 0)
                    for term_line in milestones.split('\n'):
                        if term_line.strip():
                            pdf.cell(0, 8, ar(term_line.strip()), ln=True, align='R')

                if notes:
                    pdf.ln(5); pdf.set_font('ArialCustom', '', 16); pdf.set_text_color(255, 193, 7)
                    pdf.cell(0, 10, ar("ملاحظات إضافية:"), ln=True, align='R')
                    pdf.set_font('ArialCustom', '', 14); pdf.set_text_color(0, 0, 0)
                    for term_line in notes.split('\n'):
                        if term_line.strip():
                            pdf.cell(0, 8, ar(term_line.strip()), ln=True, align='R')
                
                pdf.ln(15); pdf.set_font('ArialCustom', '', 12); pdf.set_text_color(100, 100, 100)
                pdf.cell(0, 8, ar("شكراً لثقتكم في فراتيلانزا!"), ln=True, align='R')
                pdf.cell(0, 8, ar("عرض السعر ساري لمدة 14 يوم من تاريخ الإصدار."), ln=True, align='R')

            filename = f"Quotation_{datetime.now().strftime('%H%M%S')}.pdf"
            filepath = os.path.join(date_dir, filename)
            
            pdf.output(filepath)
            
            for row in self.quote_current_tree.get_children(): self.quote_current_tree.delete(row)
            self.update_quote_total()
            self.quote_payment_terms_box.delete("1.0", "end")
            self.quote_milestones_box.delete("1.0", "end")
            self.quote_notes_box.delete("1.0", "end")
            messagebox.showinfo("Success", f"Quotation Generated and Exported successfully to:\n{filepath}")
            
        except UnicodeEncodeError:
            messagebox.showerror("Language Error", "أنت تحاول طباعة حروف عربية باستخدام النموذج الإنجليزي.\nيرجى اختيار 'Arabic (عربي)' من قائمة لغة الـ PDF.")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to generate/save PDF:\n{str(e)}")

    # ================= Sync Log Tab =================
    def setup_sync_tab(self):
        ctk.CTkLabel(self.tab_sync, text="Live Server Synchronization Log", font=("Arial", 24, "bold"), text_color="#00BFFF").pack(pady=10)
        self.sync_log_text = ctk.CTkTextbox(self.tab_sync, font=("Courier", 16, "bold"), width=900, height=500, fg_color="#1e293b", text_color="#28a745")
        self.sync_log_text.pack(pady=20, padx=20, fill="both", expand=True)
        self.sync_log_text.insert("end", "System Initialized. Background Sync Active...\n(Logs are running securely in the background terminal to prevent GUI crashes).")

    # ================= Finance & P&L Tab =================
    def setup_finance_tab(self):
        exp_frame = ctk.CTkFrame(self.tab_finance, fg_color="#1e293b", corner_radius=10); exp_frame.pack(pady=15, padx=40, fill="x", ipady=10)
        ctk.CTkLabel(exp_frame, text="Add Operating Expense:", font=("Arial", 18, "bold"), text_color="#ff4757").pack(side="left", padx=15)
        self.exp_desc = ctk.CTkEntry(exp_frame, placeholder_text="Expense Details...", font=("Arial", 16), width=300); self.exp_desc.pack(side="left", padx=10)
        self.exp_amount = ctk.CTkEntry(exp_frame, placeholder_text="Amount", font=("Arial", 16), width=150, validate="key", validatecommand=self.vcmd_num); self.exp_amount.pack(side="left", padx=10)
        self.apply_live_format(self.exp_amount)
        
        if HAS_EXTRA_LIBS: self.exp_date = DateEntry(exp_frame, width=15, font=('Arial', 16, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd'); self.exp_date.pack(side="left", padx=10)
        ctk.CTkButton(exp_frame, text="Add Expense", font=("Arial", 16, "bold"), fg_color="#ff4757", hover_color="#ff6b81", command=self.add_expense).pack(side="left", padx=20)
        if HAS_EXTRA_LIBS: ctk.CTkButton(exp_frame, text="🖨 Print P&L PDF", font=("Arial", 16, "bold"), fg_color="#17a2b8", command=self.print_financial_pdf).pack(side="right", padx=15)

        filter_frame = ctk.CTkFrame(self.tab_finance, fg_color="transparent"); filter_frame.pack(pady=5)
        
        self.fin_eye_btn = ctk.CTkButton(filter_frame, text="👁️", font=("Arial", 16), width=40, fg_color="gray", command=self.toggle_privacy)
        self.fin_eye_btn.pack(side="left", padx=15)
        self.eye_buttons.append(self.fin_eye_btn)

        if HAS_EXTRA_LIBS:
            ctk.CTkLabel(filter_frame, text="Budget From Date:", font=("Arial", 16, "bold")).pack(side="left", padx=10)
            self.cal_from = DateEntry(filter_frame, width=15, font=('Arial', 16, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd'); self.cal_from.pack(side="left", padx=10)
            ctk.CTkLabel(filter_frame, text="To Date:", font=("Arial", 16, "bold")).pack(side="left", padx=10)
            self.cal_to = DateEntry(filter_frame, width=15, font=('Arial', 16, 'bold'), background='#00BFFF', foreground='white', borderwidth=2, date_pattern='y-mm-dd'); self.cal_to.pack(side="left", padx=10)
            
            ctk.CTkButton(filter_frame, text="🔍 تصفية بالتاريخ", font=("Arial", 16, "bold"), height=35, command=lambda: self.refresh_finance_data(use_dates=True)).pack(side="left", padx=10)
            ctk.CTkButton(filter_frame, text="🔄 عرض كل الأوقات", font=("Arial", 16, "bold"), fg_color="#28a745", height=35, command=lambda: self.refresh_finance_data(use_dates=False)).pack(side="left", padx=10)

        self.pnl_frame = ctk.CTkFrame(self.tab_finance, fg_color="transparent"); self.pnl_frame.pack(pady=5, padx=40, fill="x")
        cards_frame = ctk.CTkFrame(self.pnl_frame, fg_color="transparent"); cards_frame.pack(fill="x", pady=5); cards_frame.grid_columnconfigure((0, 1), weight=1)

        rev_card = ctk.CTkFrame(cards_frame, fg_color="#102a43", corner_radius=15, border_width=1, border_color="#28a745"); rev_card.grid(row=0, column=0, padx=10, pady=5, sticky="nsew", ipady=15)
        ctk.CTkLabel(rev_card, text="Gross Revenue", font=("Arial", 20, "bold"), text_color="#28a745").pack(pady=2); self.fin_rev_lbl = ctk.CTkLabel(rev_card, text="0 EGP", font=("Arial", 28, "bold")); self.fin_rev_lbl.pack()

        cost_card = ctk.CTkFrame(cards_frame, fg_color="#102a43", corner_radius=15, border_width=1, border_color="#dc3545"); cost_card.grid(row=0, column=1, padx=10, pady=5, sticky="nsew", ipady=15)
        ctk.CTkLabel(cost_card, text="Total Base Costs", font=("Arial", 20, "bold"), text_color="#dc3545").pack(pady=2); self.fin_cost_lbl = ctk.CTkLabel(cost_card, text="0 EGP", font=("Arial", 28, "bold")); self.fin_cost_lbl.pack()

        deduct_frame = ctk.CTkFrame(cards_frame, fg_color="transparent"); deduct_frame.grid(row=1, column=0, columnspan=2, sticky="ew", pady=5); deduct_frame.grid_columnconfigure((0, 1), weight=1)
        comm_card = ctk.CTkFrame(deduct_frame, fg_color="#102a43", corner_radius=15); comm_card.grid(row=0, column=0, padx=10, sticky="nsew", ipady=5)
        ctk.CTkLabel(comm_card, text="Freelancer Commissions", font=("Arial", 16, "bold"), text_color="#ffc107").pack(); self.fin_comm_lbl = ctk.CTkLabel(comm_card, text="0 EGP", font=("Arial", 22, "bold")); self.fin_comm_lbl.pack()
        opex_card = ctk.CTkFrame(deduct_frame, fg_color="#102a43", corner_radius=15); opex_card.grid(row=0, column=1, padx=10, sticky="nsew", ipady=5)
        ctk.CTkLabel(opex_card, text="Operating Expenses (OpEx)", font=("Arial", 16, "bold"), text_color="#e83e8c").pack(); self.fin_opex_lbl = ctk.CTkLabel(opex_card, text="0 EGP", font=("Arial", 22, "bold")); self.fin_opex_lbl.pack()

        profit_card = ctk.CTkFrame(self.pnl_frame, fg_color="#002140", corner_radius=15, border_width=2, border_color="#00BFFF"); profit_card.pack(fill="x", padx=10, pady=5, ipady=10)
        ctk.CTkLabel(profit_card, text="NET PROFIT (EBITDA)", font=("Arial", 20, "bold"), text_color="#00BFFF").pack(pady=2); self.fin_profit_lbl = ctk.CTkLabel(profit_card, text="0 EGP", font=("Arial", 36, "bold"), text_color="#17a2b8"); self.fin_profit_lbl.pack()

        btn_ctrl = ctk.CTkFrame(self.tab_finance, fg_color="transparent"); btn_ctrl.pack(fill="x", padx=40)
        ctk.CTkLabel(btn_ctrl, text="Recent Operating Expenses", font=("Arial", 16, "bold")).pack(side="left")
        ctk.CTkButton(btn_ctrl, text="🗑 Delete Selected Expense", font=("Arial", 14, "bold"), fg_color="red", command=self.confirm_delete_expense).pack(side="right", padx=5)
        ctk.CTkButton(btn_ctrl, text="📊 تصدير Excel", font=("Arial", 14, "bold"), fg_color="#107c41", command=self.export_expenses_excel).pack(side="right", padx=5)
        
        cols = ("ID", "Description", "Amount", "Date"); self.expense_tree = ttk.Treeview(self.tab_finance, columns=cols, show="headings", height=5)
        self.make_treeview_sortable(self.expense_tree)
        for c in cols: self.expense_tree.column(c, anchor="center")
        self.expense_tree.pack(fill="x", padx=40, pady=5)

        self.refresh_finance_data(use_dates=False)

    def export_expenses_excel(self):
        if self.privacy_mode: return messagebox.showerror("Access Denied", "Unlock data first.")
        try:
            conn = sqlite3.connect(DB_PATH, timeout=20)
            df = pd.read_sql_query("SELECT * FROM general_expenses", conn)
            conn.close()
            df.to_excel("Fratelanza_Expenses.xlsx", index=False)
            messagebox.showinfo("Success", "تم تصدير المصروفات بنجاح!")
        except Exception as e: messagebox.showerror("Error", f"Failed: {e}")

    def confirm_delete_expense(self):
        if not self.expense_tree.selection(): return messagebox.showwarning("Warning", "Select an expense to delete!")
        self.verify_action_with_password(self.execute_delete_expense)

    def execute_delete_expense(self):
        selected = self.expense_tree.selection(); exp_id = self.expense_tree.item(selected[0])['values'][0]
        self.execute_local_and_queue_sync("DELETE FROM general_expenses WHERE id=?", (exp_id,))
        self.refresh_finance_data(use_dates=False); messagebox.showinfo("Success", "Expense deleted successfully.")

    def add_expense(self):
        desc, amt = self.exp_desc.get().strip(), self.exp_amount.get().strip()
        if not desc or not amt: return messagebox.showwarning("Error", "Enter description and amount.")
        date_val = self.exp_date.get_date().strftime('%Y-%m-%d') if HAS_EXTRA_LIBS else datetime.now().strftime('%Y-%m-%d')
        self.execute_local_and_queue_sync("INSERT INTO general_expenses (description, amount, date) VALUES (?, ?, ?)", (desc, float(amt.replace(',', '')), date_val))
        self.exp_desc.delete(0, 'end'); self.exp_amount.delete(0, 'end'); self.refresh_finance_data(use_dates=False)

    def refresh_finance_data(self, use_dates=False):
        if self.privacy_mode:
            self.fin_rev_lbl.configure(text="*** EGP")
            self.fin_cost_lbl.configure(text="*** EGP")
            self.fin_comm_lbl.configure(text="*** EGP")
            self.fin_opex_lbl.configure(text="*** EGP")
            self.fin_profit_lbl.configure(text="*** EGP")
            for row in self.expense_tree.get_children(): self.expense_tree.delete(row)
            return

        d_from = self.cal_from.get_date().strftime('%Y-%m-%d') if hasattr(self, 'cal_from') and use_dates else "1900-01-01"
        d_to = self.cal_to.get_date().strftime('%Y-%m-%d') if hasattr(self, 'cal_to') and use_dates else "2100-01-01"

        conn = sqlite3.connect(DB_PATH, timeout=20)
        df_proj = pd.read_sql_query("SELECT paid_amount, total_cost, freelancer_commission FROM pricing_records WHERE date >= ? AND date <= ?", conn, params=(f"{d_from} 00:00:00", f"{d_to} 23:59:59"))
        df_exp = pd.read_sql_query("SELECT id, description, amount, date FROM general_expenses WHERE date >= ? AND date <= ?", conn, params=(d_from, d_to))
        conn.close()

        self.tot_rev = df_proj['paid_amount'].sum() if not df_proj.empty else 0
        self.tot_comm = df_proj['freelancer_commission'].sum() if not df_proj.empty else 0
        self.tot_base_cost = (df_proj['total_cost'].sum() - self.tot_comm) if not df_proj.empty else 0
        self.tot_opex = df_exp['amount'].sum() if not df_exp.empty else 0
        self.net_profit = self.tot_rev - (self.tot_base_cost + self.tot_comm + self.tot_opex)

        self.fin_rev_lbl.configure(text=f"{self.format_money(self.tot_rev)} EGP")
        self.fin_cost_lbl.configure(text=f"{self.format_money(self.tot_base_cost)} EGP")
        self.fin_comm_lbl.configure(text=f"{self.format_money(self.tot_comm)} EGP")
        self.fin_opex_lbl.configure(text=f"{self.format_money(self.tot_opex)} EGP")
        self.fin_profit_lbl.configure(text=f"{self.format_money(self.net_profit)} EGP")

        for row in self.expense_tree.get_children(): self.expense_tree.delete(row)
        for _, row in df_exp.iterrows(): self.expense_tree.insert("", "end", values=[row['id'], row['description'], self.format_money(row['amount']), row['date']])

    def print_financial_pdf(self):
        if self.privacy_mode:
            return messagebox.showerror("Access Denied", "Financial reports export is locked! Please click the 👁️ button and enter the Master Password first.")
            
        if not HAS_EXTRA_LIBS: return messagebox.showerror("Error", "fpdf2 library missing!")
        pdf = FPDF(); pdf.add_page()
        if os.path.exists(LOGO_PATH): pdf.image(LOGO_PATH, x=150, y=8, w=45)
        pdf.set_font('Helvetica', 'B', 32); pdf.set_text_color(10, 25, 47); pdf.cell(0, 15, "Fratelanza", ln=True, align='L')
        pdf.set_font('Helvetica', '', 12); pdf.set_text_color(100, 100, 100); pdf.cell(0, 8, f"Tax Reg No: {self.tax_id}", ln=True, align='L')
        pdf.set_y(40); pdf.set_draw_color(0, 191, 255); pdf.set_line_width(1.0); pdf.line(10, pdf.get_y(), 200, pdf.get_y()); pdf.set_line_width(0.2); pdf.ln(10)
        pdf.set_font('Helvetica', 'I', 14); pdf.set_text_color(100, 100, 100); pdf.cell(0, 10, "Official Financial Statement (P&L)", ln=True, align='L')
        
        d_from = self.cal_from.get_date().strftime('%Y-%m-%d') if hasattr(self, 'cal_from') else "All Time"
        d_to = self.cal_to.get_date().strftime('%Y-%m-%d') if hasattr(self, 'cal_to') else "All Time"
        pdf.set_font('Helvetica', '', 12); pdf.cell(0, 10, f"Period: {d_from} TO {d_to}", ln=True, align='L')
        pdf.cell(0, 10, f"Generated On: {datetime.now().strftime('%Y-%m-%d %H:%M')}", ln=True, align='L'); pdf.ln(10)

        def add_financial_row(label, value, is_bold=False, is_profit=False, is_total=False):
            fill = True if is_total else False
            if is_total: pdf.set_fill_color(240, 248, 255)
            pdf.set_font('Helvetica', 'B' if is_bold else '', 16)
            if is_profit: pdf.set_text_color(40, 167, 69) if value >= 0 else pdf.set_text_color(220, 53, 69)
            else: pdf.set_text_color(0, 0, 0)
            pdf.cell(130, 15, label, border=1, fill=fill); pdf.cell(60, 15, f"{self.format_num(value)} EGP", border=1, align='R', ln=True, fill=fill)

        add_financial_row("Gross Revenue (+)", self.tot_rev); add_financial_row("Project Base Costs (-)", self.tot_base_cost)
        add_financial_row("Freelancer Commissions (-)", self.tot_comm); add_financial_row("Operating Expenses (-)", self.tot_opex); pdf.ln(5)
        add_financial_row("NET PROFIT / EBITDA", self.net_profit, is_bold=True, is_profit=True, is_total=True)

        pdf.ln(30); pdf.set_font('Helvetica', '', 12); pdf.set_text_color(0, 0, 0)
        pdf.cell(95, 10, "Prepared By: ............................", align='L'); pdf.cell(95, 10, "Approved By: ............................", align='R')
        filename = f"Fratelanza_Financials_{datetime.now().strftime('%Y%m%d_%H%M')}.pdf"
        try: pdf.output(os.path.join(BASE_DIR, filename)); messagebox.showinfo("Success", f"Report Saved:\n{filename}")
        except Exception as e: messagebox.showerror("Error", f"Failed to save PDF: {e}")

if __name__ == "__main__":
    app = FratelanzaERP()
    app.mainloop()