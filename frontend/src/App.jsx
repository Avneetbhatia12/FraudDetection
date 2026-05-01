import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';

// Auth
import Login          from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';

// Dashboard
import Dashboard from './pages/dashboard/Dashboard';

// Patients
import PatientList    from './pages/patients/PatientList';
import PatientDetails from './pages/patients/PatientDetails';
import PatientForm    from './pages/patients/PatientForm';

// Policies
import PolicyList    from './pages/policies/PolicyList';
import PolicyDetails from './pages/policies/PolicyDetails';
import PolicyForm    from './pages/policies/PolicyForm';

// Providers
import ProviderList    from './pages/providers/ProviderList';
import ProviderDetails from './pages/providers/ProviderDetails';
import ProviderForm    from './pages/providers/ProviderForm';

// Claims
import ClaimList    from './pages/claims/ClaimList';
import ClaimDetails from './pages/claims/ClaimDetails';
import ClaimForm    from './pages/claims/ClaimForm';

// Fraud
import FlaggedClaims    from './pages/fraud/FlaggedClaims';
import InvestigationView from './pages/fraud/InvestigationView';
import FraudRules       from './pages/fraud/FraudRules';
import FraudRuleForm    from './pages/fraud/FraudRuleForm';

// Users
import UserList    from './pages/users/UserList';
import UserDetails from './pages/users/UserDetails';
import UserForm    from './pages/users/UserForm';

// Reports
import Reports from './pages/reports/Reports';

const PrivateRoute = ({ children }) => {
  const { isAuthenticated } = useAuth();
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

const AppRoutes = () => (
  <Routes>
    {/* Public */}
    <Route path="/login"           element={<Login />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />

    {/* Protected */}
    <Route path="/dashboard"  element={<PrivateRoute><Dashboard /></PrivateRoute>} />

    <Route path="/patients"        element={<PrivateRoute><PatientList /></PrivateRoute>} />
    <Route path="/patients/new"    element={<PrivateRoute><PatientForm /></PrivateRoute>} />
    <Route path="/patients/:id"    element={<PrivateRoute><PatientDetails /></PrivateRoute>} />
    <Route path="/patients/:id/edit" element={<PrivateRoute><PatientForm /></PrivateRoute>} />

    <Route path="/policies"        element={<PrivateRoute><PolicyList /></PrivateRoute>} />
    <Route path="/policies/new"    element={<PrivateRoute><PolicyForm /></PrivateRoute>} />
    <Route path="/policies/:id"    element={<PrivateRoute><PolicyDetails /></PrivateRoute>} />
    <Route path="/policies/:id/edit" element={<PrivateRoute><PolicyForm /></PrivateRoute>} />

    <Route path="/providers"       element={<PrivateRoute><ProviderList /></PrivateRoute>} />
    <Route path="/providers/new"   element={<PrivateRoute><ProviderForm /></PrivateRoute>} />
    <Route path="/providers/:id"   element={<PrivateRoute><ProviderDetails /></PrivateRoute>} />
    <Route path="/providers/:id/edit" element={<PrivateRoute><ProviderForm /></PrivateRoute>} />

    <Route path="/claims"          element={<PrivateRoute><ClaimList /></PrivateRoute>} />
    <Route path="/claims/new"      element={<PrivateRoute><ClaimForm /></PrivateRoute>} />
    <Route path="/claims/:id"      element={<PrivateRoute><ClaimDetails /></PrivateRoute>} />

    <Route path="/fraud-flags"     element={<PrivateRoute><FlaggedClaims /></PrivateRoute>} />
    <Route path="/fraud-flags/:id" element={<PrivateRoute><InvestigationView /></PrivateRoute>} />
    <Route path="/fraud-rules"     element={<PrivateRoute><FraudRules /></PrivateRoute>} />
    <Route path="/fraud-rules/new" element={<PrivateRoute><FraudRuleForm /></PrivateRoute>} />
    <Route path="/fraud-rules/:id/edit" element={<PrivateRoute><FraudRuleForm /></PrivateRoute>} />

    <Route path="/reports"         element={<PrivateRoute><Reports /></PrivateRoute>} />

    <Route path="/users"           element={<PrivateRoute><UserList /></PrivateRoute>} />
    <Route path="/users/new"       element={<PrivateRoute><UserForm /></PrivateRoute>} />
    <Route path="/users/:id"       element={<PrivateRoute><UserDetails /></PrivateRoute>} />
    <Route path="/users/:id/edit"  element={<PrivateRoute><UserForm /></PrivateRoute>} />

    {/* Redirects */}
    <Route path="/"  element={<Navigate to="/dashboard" replace />} />
    <Route path="*"  element={<Navigate to="/dashboard" replace />} />
  </Routes>
);

const App = () => (
  <AuthProvider>
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  </AuthProvider>
);

export default App;
