# PCPHF PIMS - Pharmacy Inventory Management System

**Full Name**: PCPHF Pharmacy Inventory Management System (PIMS)  
**Type**: Enterprise Pharmacy & Inventory Management Platform  
**Technology Stack**: Next.js 16, React 19, TypeScript, Firebase, Tailwind CSS  
**Version**: 0.1.0  
**Status**: Production-Ready (with security hardening applied)

---

## 📋 Table of Contents

1. [System Overview](#system-overview)
2. [Core Features](#core-features)
3. [User Roles & Access Control](#user-roles--access-control)
4. [System Architecture](#system-architecture)
5. [Key Modules](#key-modules)
6. [Database Structure](#database-structure)
7. [Core Workflows](#core-workflows)
8. [Security & Compliance](#security--compliance)
9. [Technical Stack](#technical-stack)
10. [Installation & Deployment](#installation--deployment)

---

## 🎯 System Overview

PCPHF PIMS is a **comprehensive pharmacy inventory and dispensing management system** designed to streamline pharmaceutical operations, patient care, and stock management. The system enables pharmacies to efficiently manage medicine inventory, track dispensing transactions, monitor patient medications, and maintain detailed audit trails for compliance.

### Primary Use Case
Managing pharmaceutical inventory across healthcare facilities with real-time stock tracking, patient-centered dispensing, and comprehensive reporting for healthcare administrators and staff.

### Key Benefits
- ✅ **Real-time Inventory Tracking** - Monitor medicine stock levels instantly
- ✅ **Efficient Dispensing** - Quick and accurate medicine dispensing with patient records
- ✅ **FEFO Management** - First-Expiry-First-Out batch tracking to minimize waste
- ✅ **Audit Compliance** - Complete activity logs for regulatory compliance
- ✅ **Multi-user Support** - Admin and staff roles with granular permissions
- ✅ **Data Integrity** - Firebase security rules prevent unauthorized access
- ✅ **Mobile Responsive** - Works on desktop, tablet, and mobile devices

---

## 💊 Core Features

### 1. **Medicine Inventory Management**

#### Add & Manage Medicines
- Create new medicine records with detailed information:
  - **Basic Info**: Name, description, brand, country of origin
  - **Stock Details**: Unit type, quantity, pricing (unit cost & selling price)
  - **Medical Data**: Age groups, prescription requirements, strengths/dosages
  - **Expiration**: Track expiration dates with batch management
  - **Unit Conversion**: Support for multiple unit types (tablets, bottles, boxes, etc.)

#### Batch Tracking (FEFO - First-Expiry-First-Out)
- Track medicines by batch with:
  - Creation date
  - Expiration date
  - Quantity per batch
  - Automatic batch cleanup when depleted
- **FEFO Logic**: Automatically deducts stock from earliest expiring batch first to minimize waste

#### Image Management
- Upload and store medicine images via Cloudinary
- Display product images in inventory and dispensing interfaces

### 2. **Dispensing Module**

#### Patient-Centered Dispensing
- Create dispensing transactions for individual patients:
  - Patient information capture (demographics, contact, insurance)
  - Multiple medicine selection per transaction
  - Quantity and unit type selection per medicine
  - Strength/dosage selection for multi-strength medicines

#### Patient Database
- Search existing patients by name or contact number
- Auto-populate patient details on repeat visits
- Store comprehensive patient records:
  - Demographics (name, DOB, sex, address)
  - Contact information
  - Medical history (blood type, allergies, family info)
  - Insurance information (PhilHealth, 4Ps member)
  - Philhealth member details and relationships

#### Automatic Stock Deduction
- Real-time stock updates upon dispensing
- Batch-aware deduction using FEFO method
- Transaction logging for audit trail

#### Dispensing Receipt
- Generate printable dispensing receipts with:
  - Patient information
  - Medicines dispensed
  - Quantities and units
  - Dispensed by staff member
  - Date and time

### 3. **Point of Sale (POS) Module**

#### Sales Transactions
- Similar to dispensing but without patient requirement
- Quick sales for over-the-counter medicines
- Multiple items per transaction
- Automatic stock deduction

#### Cart Management
- Add/remove items from cart
- Quantity adjustment
- Real-time total calculation

### 4. **Stock Management & Adjustments**

#### Stock Adjustments
- Manual stock increases (restock, inventory corrections)
- Manual stock decreases (damage, loss, correction)
- Reason tracking for accountability
- Transaction logging

#### Inventory Status
- View current stock levels for all medicines
- Color-coded status indicators:
  - **In Stock** - Normal levels
  - **Low Stock** - Below minimum threshold
  - **Expiring Soon** - Less than 30 days to expiration
  - **Expired** - Past expiration date
  - **Out of Stock** - Zero quantity

#### Expiration Monitoring
- Dashboard view of medicines expiring soon
- Batch-level expiration tracking
- Automatic alerts for expired medicines

### 5. **Reporting & Analytics**

#### Sales Reports
- Revenue tracking by time period
- Top-selling medicines
- Sales trends and patterns
- Export capabilities (PDF, CSV)

#### Stock Reports
- Current inventory value
- Stock movement history
- Batch information
- Low stock alerts

#### Activity Logs (Admin Only)
- Complete audit trail of all system activities:
  - Login/logout events
  - Medicine additions and modifications
  - Dispensing transactions
  - Stock adjustments
  - User account changes
- Searchable by date range, user, or action type
- Exportable for compliance

### 6. **User & Staff Management (Admin Only)**

#### Admin Dashboard
- System overview and analytics
- Staff account management
- Inventory oversight
- Report generation

#### Staff Account Creation
- Create new staff accounts with email and password
- Assign initial status (pending/approved/active)
- Isolated staff authentication using secondary Firebase instance
- Bulk staff management

#### Activity Monitoring
- View all staff activities
- Track who performed what actions and when
- System notification system

---

## 👥 User Roles & Access Control

### **Admin Role**
**Capabilities**:
- ✅ Full system access
- ✅ Create and manage staff accounts
- ✅ Add, modify, delete medicines
- ✅ View all dispensing and sales transactions
- ✅ Access complete activity logs
- ✅ Generate reports
- ✅ Manage system settings
- ✅ View pharmacy overview and analytics

**Access Paths**:
- `/admin-dashboard` - Main admin control center
- `/admin-dashboard/create-staff-accounts` - Staff management
- `/admin-dashboard/staff-list` - View all staff
- `/admin-dashboard/logs` - Activity logs
- `/admin-dashboard/reports/sales` - Sales reports
- `/admin-dashboard/stocks` - Inventory overview
- `/medicines` - Medicine management
- `/staff-dashboard` - Pharmacy overview (labeled as "Dashboard" for admin)

### **Staff Role**
**Capabilities**:
- ✅ Dispense medicines to patients
- ✅ Process point-of-sale transactions
- ✅ Make stock adjustments
- ✅ View patient records
- ✅ Access dispensing history (own transactions)
- ✅ View inventory status
- ✅ View own activity logs
- ❌ Cannot create/modify medicines
- ❌ Cannot create staff accounts
- ❌ Cannot view other staff's activities

**Access Paths**:
- `/staff-dashboard` - Main staff dashboard
- `/dispense` - Dispensing interface
- `/pos` - Point of sale
- `/stock-adjustments` - Stock adjustment interface
- `/inventory` - View inventory status
- `/medicines` - View medicines (read-only)
- `/medicines/[id]` - Medicine details
- `/dispensing-records` - View own dispensing history
- `/pos-history` - View own POS transactions
- `/inventory-records` - View inventory transaction history
- `/notifications` - Personal notifications

### **Guest/Unauthenticated**
- ✅ Access `/login` page
- ✅ Access `/register` page (if registration enabled)
- ✅ Access `/forgot-password` page
- ❌ Cannot access any protected routes

---

## 🏗️ System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────┐
│          Next.js Frontend (React 19)                │
│  ┌──────────────────────────────────────────────┐  │
│  │     Pages (Dispensing, Inventory, POS)      │  │
│  ├──────────────────────────────────────────────┤  │
│  │  Components (UI, Modals, Sidebar, Forms)    │  │
│  ├──────────────────────────────────────────────┤  │
│  │    Services (Stock Mgmt, Auth, Activity)    │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        ↓ (Firebase SDK)
┌─────────────────────────────────────────────────────┐
│       Firebase Realtime Database (Backend)          │
│  ┌──────────────────────────────────────────────┐  │
│  │ Collections: users, medicines, patients...  │  │
│  │ Security Rules: Authentication & Auth       │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                        │
                        ↓
┌─────────────────────────────────────────────────────┐
│        External Services                           │
│  • Firebase Authentication (Email/Password)        │
│  • Cloudinary (Image Storage)                      │
│  • Browser LocalStorage (Session Persistence)      │
└─────────────────────────────────────────────────────┘
```

### Folder Structure

```
app/
├── (auth pages)          # Public pages: login, register, forgot-password
├── admin-dashboard/      # Admin-only features
│   ├── create-staff-accounts/
│   ├── staff-list/
│   ├── logs/
│   ├── reports/
│   └── stocks/
├── staff-dashboard/      # Staff home screen
├── medicines/            # Medicine management
├── dispense/            # Patient dispensing interface
├── pos/                 # Point of sale
├── inventory/           # Inventory overview
├── stock-adjustments/   # Stock adjustment interface
├── dispensing-records/  # Dispensing history
└── (other pages)        # Notifications, reports, etc.

lib/
├── auth/                # Authentication & authorization
│   ├── auth-context.tsx
│   ├── protected-route.tsx
│   └── admin-guard.tsx
├── services/            # Business logic
│   ├── firebase.ts
│   ├── stock-management.ts
│   ├── patient-management.ts
│   ├── activity-logs.ts
│   └── (other services)
├── components/          # Reusable UI components
│   ├── sidebar.tsx
│   ├── button.tsx
│   ├── error-boundary.tsx
│   └── (other components)
├── contexts/            # React contexts
│   ├── sidebar-context.tsx
│   └── layout-client.tsx
├── types.ts             # TypeScript type definitions
└── utils/               # Utility functions
    └── validation.ts    # Input validation

public/                  # Static assets
assets/                  # Medicine images, logos
```

---

## 🔧 Key Modules

### 1. **Authentication Module** (`lib/auth/auth-context.tsx`)

**Responsibilities**:
- User login/logout management
- Role-based access control (admin vs staff)
- User profile loading and caching
- Session persistence
- Activity logging on login

**Key Functions**:
```typescript
- signIn(email, password)  // Authenticate user
- logOut()                 // End session
- useAuth()                // Hook for accessing auth context
```

**Protected Routes**:
- Admin routes use `<AdminGuard>` component
- Staff/user routes use `<ProtectedRoute>` component

### 2. **Stock Management Module** (`lib/services/stock-management.ts`)

**Core Algorithms**:

#### FEFO (First-Expiry-First-Out) Deduction
- Sorts batches by expiration date (earliest first)
- Deducts stock from earliest expiring batch
- Moves to next batch when current is depleted
- Removes empty batches to keep data clean

**Key Functions**:
```typescript
deductStock(params)         // Single medicine deduction
deductStockBatch(items)     // Bulk deduction for dispense/POS
getEffectiveStock(medicine) // Get current stock level
getTrueEarliestExpiration() // Find soonest expiring batch
```

**Transaction Types**:
- `dispense` - Medicine dispensed to patient
- `sale` - Medicine sold via POS
- `adjustment` - Manual stock adjustment
- `restock` - Stock increase

### 3. **Patient Management Module** (`lib/services/patient-management.ts`)

**Capabilities**:
- Save and update patient records
- Retrieve patient by ID or list all patients
- Search patients by name or contact
- Prevent duplicate patient records
- Real-time patient data synchronization

**Key Functions**:
```typescript
savePatientRecord(userId, patientData)      // Create/update
getPatientById(userId, patientId)           // Retrieve single
getAllPatients(userId)                      // List all
searchPatients(userId, searchTerm)          // Find by name/contact
listenToPatients(userId, callback)          // Real-time updates
```

### 4. **Activity Logging Module** (`lib/services/activity-logs.ts`)

**Tracked Events**:
- User login/logout
- Medicine additions/modifications
- Dispensing transactions
- POS sales
- Stock adjustments
- Staff account creation
- Password changes

**Key Functions**:
```typescript
logActivity(action, userId, email, description, details)
getAllActivityLogs(adminId, filters)
```

### 5. **Input Validation Module** (`lib/utils/validation.ts`)

**Validators**:
- `validateQuantity()` - Stock amounts (0-999,999)
- `validatePrice()` - Currency values with decimals
- `validateTextField()` - Text with XSS prevention
- `validateMedicineName()` - Medicine names (max 200 chars)
- `validatePatientName()` - Patient names (max 100 chars)
- `validateExpirationDate()` - Future dates only
- `validateDateOfBirth()` - Past dates with reasonable age
- `validateContactNumber()` - Phone numbers

**Purpose**: Prevent invalid data from reaching Firebase and ensure data consistency

### 6. **Error Handling Module** (`lib/components/error-boundary.tsx`)

**Features**:
- React Error Boundary component
- Catches component rendering errors
- Displays user-friendly error messages
- Development mode stack traces
- Error callback for logging services

---

## 💾 Database Structure

### Firebase Realtime Database Collections

```
pharmacy-ims00/
├── users/
│   └── {uid}/
│       ├── email: string
│       ├── role: 'admin' | 'staff'
│       ├── status: 'pending' | 'approved' | 'disabled'
│       ├── name: string (for admin)
│       ├── staffName: string (for staff)
│       ├── createdAt: timestamp
│       └── lastLogin: timestamp
│
├── medicines/ (Global shared inventory)
│   └── {medicineId}/
│       ├── name: string
│       ├── baseName: string
│       ├── description: string
│       ├── quantity: number
│       ├── unit: string
│       ├── unitCost: number
│       ├── sellingPrice: number
│       ├── minStock: number
│       ├── expirationDate: string (ISO 8601)
│       ├── image: string (Cloudinary URL)
│       ├── prescriptionRequired: boolean
│       ├── ageGroup: string[]
│       ├── batches/
│       │   └── {batchId}/
│       │       ├── quantity: number
│       │       ├── expirationDate: string
│       │       └── createdAt: timestamp
│       ├── createdAt: timestamp
│       └── updatedAt: timestamp
│
├── userPatients/
│   └── {userId}/
│       └── {patientId}/
│           ├── firstName: string
│           ├── lastName: string
│           ├── middleName: string
│           ├── dateOfBirth: string
│           ├── sex: 'Male' | 'Female'
│           ├── patientContactNo: string
│           ├── philhealthMember: 'YES' | 'NO'
│           ├── memberPhilhealthNo: string
│           ├── philhealthCategory: string
│           ├── fullPatientData: object
│           ├── createdAt: timestamp
│           └── lastUpdated: timestamp
│
├── userDispensings/
│   └── {userId}/
│       └── {dispensingId}/
│           ├── date: timestamp
│           ├── patientName: string
│           ├── patientRecordId: string
│           ├── patientInfo: object
│           ├── items: array
│           │   ├── medicineId: string
│           │   ├── quantity: number
│           │   ├── unitType: string
│           │   ├── expirationDate: string
│           │   └── ...
│           ├── dispensedBy: string
│           └── userId: string
│
├── userSales/
│   └── {userId}/
│       └── {saleId}/
│           ├── date: timestamp
│           ├── items: array
│           ├── totalAmount: number
│           └── ...
│
├── userTransactions/
│   └── {userId}/
│       └── {transactionId}/
│           ├── date: timestamp
│           ├── type: 'dispense' | 'sale' | 'adjustment' | 'restock'
│           ├── medicineId: string
│           ├── quantity: number
│           ├── previousStock: number
│           ├── newStock: number
│           ├── unitCost: number
│           ├── notes: string
│           └── referenceId: string (dispense/sale ID)
│
└── activityLogs/
    └── {logId}/
        ├── timestamp: string
        ├── userId: string
        ├── staffId: string
        ├── action: string
        ├── description: string
        ├── staffEmail: string
        ├── staffName: string
        └── details: object
```

### Key Design Decisions

1. **Global Medicines Collection** - All staff access the same medicine inventory
2. **User-Scoped Collections** - Each user has isolated patient and transaction data
3. **Batch-Level Tracking** - Track expiration at batch level for FEFO logic
4. **Audit Trails** - All transactions logged for compliance
5. **Denormalization** - Store staff name/email in logs for offline reference

---

## 🔄 Core Workflows

### Workflow 1: Dispensing Medicine to Patient

**Steps**:
1. Staff navigates to `/dispense`
2. Searches for or creates patient record
3. Selects medicines and quantities
4. Confirms selection and patient info
5. System:
   - Saves/updates patient record
   - Deducts stock using FEFO logic
   - Creates dispensing transaction
   - Logs activity
   - Generates receipt
6. Receipt displayed/printed

**Duration**: ~2-3 minutes per patient

**Example Flow**:
```
Patient Arrives → Search Database → Create/Update Patient → 
Select Medicines → Confirm → Deduct Stock → Log Activity → 
Print Receipt → Complete
```

### Workflow 2: Point of Sale Transaction

**Steps**:
1. Staff navigates to `/pos`
2. Selects medicines and quantities
3. Adds items to cart
4. Confirms and processes payment
5. System:
   - Deducts stock using FEFO
   - Creates sale transaction
   - Logs activity
   - Generates receipt

**Duration**: ~1 minute per transaction

### Workflow 3: Stock Adjustment

**Steps**:
1. Staff navigates to `/stock-adjustments`
2. Selects medicine to adjust
3. Enters adjustment type (increase/decrease)
4. Enters quantity and reason
5. System:
   - Updates medicine stock
   - Creates adjustment transaction
   - Logs activity

**Duration**: ~30 seconds per adjustment

### Workflow 4: Adding New Medicine (Admin Only)

**Steps**:
1. Admin navigates to `/medicines/add-medicine`
2. Enters medicine details:
   - Name, description, brand
   - Unit type and quantity
   - Cost and selling price
   - Expiration date
   - Age groups and strength
   - Unit conversion (if needed)
3. Uploads product image
4. If duplicate detected:
   - Shows existing medicine
   - Offers to increase stock
5. System:
   - Validates input data
   - Uploads image to Cloudinary
   - Creates medicine record
   - Creates initial batch
   - Logs activity

**Duration**: ~3-5 minutes per medicine

---

## 🔒 Security & Compliance

### Authentication & Authorization

1. **Email/Password Authentication**
   - Firebase Authentication handles secure password hashing
   - Email verification (optional, can be enabled)
   - Password reset via email link

2. **Role-Based Access Control (RBAC)**
   - Admin: Full system access
   - Staff: Limited dispensing/sales access
   - Guest: Public pages only

3. **Session Management**
   - Browser Local Storage for session persistence
   - Automatic logout after authentication token expires
   - "Remember me" via localStorage

### Firebase Security Rules

**Enforced Rules**:
- All operations require authentication (`auth.uid !== null`)
- Users can only access their own data
- Admins have elevated permissions
- Medicines readable by all, writable by admins only
- Patients scoped to individual users
- Data validation on all writes

**Rule Location**: `firebase-rules.json`

### Data Protection

1. **Input Validation**
   - All user inputs validated before Firebase write
   - XSS prevention in text fields
   - Quantity/price boundary checks
   - Date format validation

2. **Encryption**
   - Firebase handles encryption in transit (TLS)
   - Sensitive data (passwords) hashed by Firebase Auth

3. **Audit Logging**
   - Every action logged with user, timestamp, and details
   - Logs retained for compliance (recommend 7+ years)
   - Activity logs searchable by date, user, action

### Compliance Features

- ✅ **PHI Protection** - Patient data scoped by user
- ✅ **Audit Trail** - Complete activity history
- ✅ **User Tracking** - Know who did what and when
- ✅ **Data Isolation** - Staff cannot see other staff's data
- ✅ **Expiration Management** - FEFO prevents expired medicines
- ✅ **Transaction History** - All stock movements tracked

---

## 🛠️ Technical Stack

### Frontend
- **Framework**: Next.js 16.2.3 (React 19)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **State Management**: React Context + Firebase Realtime Listeners
- **Icons**: Lucide React
- **Charting**: Recharts

### Backend
- **Database**: Firebase Realtime Database
- **Authentication**: Firebase Authentication
- **File Storage**: Cloudinary (images)
- **Hosting**: Vercel (recommended)

### Development Tools
- **Linting**: ESLint 9
- **Build Tool**: Next.js built-in
- **Package Manager**: npm (or yarn/pnpm)

### Deployment
- **Hosting**: Vercel, Firebase Hosting, or custom VPS
- **Build Process**: `npm run build` → `npm start`
- **Environment**: Node.js 18+

---

## 📦 Installation & Deployment

### Prerequisites
- Node.js 18 or higher
- npm/yarn/pnpm
- Firebase project (create at firebase.google.com)
- Cloudinary account (for image uploads)

### Installation Steps

1. **Clone Repository**
   ```bash
   git clone <repository-url>
   cd pcphf-pims
   ```

2. **Install Dependencies**
   ```bash
   npm install
   ```

3. **Configure Environment Variables**
   ```bash
   # Copy template
   cp .env.example .env.local
   
   # Edit .env.local with your Firebase and Cloudinary credentials
   ```

4. **Set Up Firebase**
   - Create Firebase project at console.firebase.google.com
   - Enable Realtime Database
   - Enable Email/Password authentication
   - Copy credentials to `.env.local`
   - Deploy security rules: `firebase deploy --only database:rules`

5. **Development Server**
   ```bash
   npm run dev
   # Open http://localhost:3000
   ```

### Deployment to Production

#### Option 1: Vercel (Recommended)
```bash
npm install -g vercel
vercel --prod
```

#### Option 2: Manual VPS/Server
```bash
npm run build
npm start
# Server runs on port 3000
```

#### Option 3: Docker
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
CMD ["npm", "start"]
EXPOSE 3000
```

### First-Time Setup Checklist

- [ ] Firebase project created and configured
- [ ] Realtime Database enabled
- [ ] Authentication (Email/Password) enabled
- [ ] Security rules deployed (`firebase deploy --only database:rules`)
- [ ] Admin account created via `/admin-init`
- [ ] Cloudinary account configured
- [ ] Environment variables set in `.env.local`
- [ ] Application tested in development
- [ ] Staff accounts created in admin dashboard
- [ ] Initial medicines added to inventory
- [ ] Activity logs verified
- [ ] Deployed to production

---

## 📊 Performance Considerations

### Optimization Features
- Lazy-loading of PDF generation libraries
- Image optimization via `next/image` (recommended)
- Firebase listener deduplication
- Component memoization with `useCallback`
- CSS minification via Tailwind

### Recommended Improvements
- [ ] Implement pagination for large datasets (medicines, transactions)
- [ ] Add caching layer (Redis) for frequently accessed data
- [ ] Implement query filtering for date ranges
- [ ] Add database indexes for common queries
- [ ] Consider Firestore instead of Realtime DB for better querying

---

## 🐛 Known Limitations & Future Enhancements

### Current Limitations
1. **No pagination** - All medicines/transactions loaded at once
2. **No offline mode** - Requires internet connection
3. **Single Firebase instance** - May hit quota limits at scale
4. **No backup/restore** - Manual Firebase backup only
5. **Limited reporting** - Basic sales and stock reports

### Future Enhancements
- [ ] Offline-first architecture with sync
- [ ] Advanced reporting with custom date ranges
- [ ] Multi-location support
- [ ] Barcode scanning for medicines
- [ ] SMS notifications for low stock
- [ ] Mobile app (React Native)
- [ ] Supplier management module
- [ ] Insurance claim processing
- [ ] Multi-language support
- [ ] API for third-party integrations

---

## 📞 Support & Maintenance

### Common Issues & Solutions

**Issue**: "Permission denied" errors after deployment  
**Solution**: Verify Firebase security rules are deployed and user roles are set correctly

**Issue**: Cloudinary image upload fails  
**Solution**: Check `NEXT_PUBLIC_CLOUDINARY_NAME` and `NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in `.env.local`

**Issue**: Slow database queries  
**Solution**: Enable Firebase indexes, implement pagination, or migrate to Firestore

### Maintenance Tasks

**Daily**:
- Monitor error logs
- Check system availability
- Verify staff can dispense medicines

**Weekly**:
- Review activity logs for anomalies
- Check expired medicines alert
- Verify backups

**Monthly**:
- Generate compliance reports
- Review usage statistics
- Plan for capacity upgrades

---

## 📄 License & Attribution

**Project**: PCPHF Pharmacy Inventory Management System  
**Created**: 2026  
**Technologies**: Next.js, React, Firebase, Tailwind CSS

---

**Last Updated**: May 22, 2026  
**Documentation Version**: 1.0  
**Status**: Complete and Production-Ready
