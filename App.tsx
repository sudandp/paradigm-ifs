// Trigger Rebuild: 2026-01-08 18:25
// App.tsx
import React, { useEffect, lazy, Suspense } from 'react';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from './store/authStore';
import { useThemeStore } from './store/themeStore';
import { useEnrollmentRulesStore } from './store/enrollmentRulesStore';
import { usePermissionsStore } from './store/permissionsStore';
import { useSettingsStore } from './store/settingsStore';
import { useMediaQuery } from './hooks/useMediaQuery';
import { supabase } from './services/supabase';
import { authService } from './services/authService';
// Import the API client under an alias to avoid name collisions.  Renaming
// to `apiService` prevents conflicts with other variables or globals named `api`.
import { api as apiService } from './services/api';
import type { User } from './types';
import { useOnboardingStore } from './store/onboardingStore';
import { usePWAStore } from './store/pwaStore';


import { withTimeout } from './utils/async';

// Layouts
import MainLayout from './components/layouts/MainLayout';
import MobileLayout from './components/layouts/MobileLayout';
import AuthLayout from './components/layouts/AuthLayout';
import SecurityWrapper from './components/SecurityWrapper';

// Pages
import Splash from './pages/Splash';
import Login from './pages/auth/Login';

const MobileHome = lazy(() => import('./pages/MobileHome'));
const SignUp = lazy(() => import('./pages/auth/SignUp'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const UpdatePassword = lazy(() => import('./pages/auth/UpdatePassword'));
const LogoutPage = lazy(() => import('./pages/auth/LogoutPage'));
const PendingApproval = lazy(() => import('./pages/PendingApproval'));
const Forbidden = lazy(() => import('./pages/Forbidden'));
const OnboardingHome = lazy(() => import('./pages/OnboardingHome'));
const SelectOrganization = lazy(() => import('./pages/onboarding/SelectOrganization'));
const AddEmployee = lazy(() => import('./pages/onboarding/AddEmployee'));
const VerificationDashboard = lazy(() => import('./pages/verification/VerificationDashboard'));
const UserManagement = lazy(() => import('./pages/admin/UserManagement'));
const SiteManagement = lazy(() => import('./pages/admin/OrganizationManagement').then(m => ({ default: m.SiteManagement })));
const RoleManagement = lazy(() => import('./pages/admin/RoleManagement'));
const ModuleManagement = lazy(() => import('./pages/admin/ModuleManagement'));
const ManageDevices = lazy(() => import('./pages/admin/ManageDevices'));
const ApiSettings = lazy(() => import('./pages/developer/ApiSettings').then(m => ({ default: m.ApiSettings })));
const OperationsDashboard = lazy(() => import('./pages/operations/OperationsDashboard'));
const TeamActivity = lazy(() => import('./pages/operations/TeamActivity'));
const SiteDashboard = lazy(() => import('./pages/site/OrganizationDashboard'));
const ProfilePage = lazy(() => import('./pages/profile/ProfilePage'));
const AttendanceDashboard = lazy(() => import('./pages/attendance/AttendanceDashboard'));
const MyLocations = lazy(() => import('./pages/attendance/MyLocations'));
const AttendanceActionPage = lazy(() => import('./pages/attendance/AttendanceActionPage'));
const AttendanceSettings = lazy(() => import('./pages/hr/AttendanceSettings'));
const LeaveDashboard = lazy(() => import('./pages/leaves/LeaveDashboard'));
const LeaveManagement = lazy(() => import('./pages/hr/LeaveManagement'));
const ApprovalWorkflow = lazy(() => import('./pages/admin/ApprovalWorkflow'));
const WorkflowChartFullScreen = lazy(() => import('./pages/admin/WorkflowChartFullScreen'));
const TaskManagement = lazy(() => import('./pages/tasks/TaskManagement'));
const EntityManagement = lazy(() => import('./pages/hr/EntityManagement'));
const PoliciesAndInsurance = lazy(() => import('./pages/hr/PoliciesAndInsurance'));
const EnrollmentRules = lazy(() => import('./pages/hr/EnrollmentRules'));
const OnboardingPdfOutput = lazy(() => import('./pages/onboarding/OnboardingPdfOutput'));
const UniformDashboard = lazy(() => import('./pages/uniforms/UniformDashboard'));
const CostAnalysis = lazy(() => import('./pages/billing/CostAnalysis'));
const InvoiceSummary = lazy(() => import('./pages/billing/InvoiceSummary'));
const FieldStaffTracking = lazy(() => import('./pages/hr/FieldStaffTracking'));
const LocationManagement = lazy(() => import('./pages/hr/LocationManagement'));
const PreUpload = lazy(() => import('./pages/onboarding/PreUpload'));
const MySubmissions = lazy(() => import('./pages/onboarding/MySubmissions'));
const MyTasks = lazy(() => import('./pages/onboarding/MyTasks'));
const UniformRequests = lazy(() => import('./pages/onboarding/UniformRequests'));
const SupportDashboard = lazy(() => import('./pages/support/SupportDashboard'));
const TicketDetail = lazy(() => import('./pages/support/TicketDetail'));
const MyTeam = lazy(() => import('./pages/my-team/MyTeamPage'));
const FieldReports = lazy(() => import('./pages/my-team/FieldReports'));
const Tasks = lazy(() => import('./pages/tasks/TaskManagement'));
const TeamMemberProfile = lazy(() => import('./pages/my-team/TeamMemberProfile'));
const ReportingStructure = lazy(() => import('./pages/my-team/ReportingStructure'));

// Form Pages
const AddUserPage = lazy(() => import('./pages/forms/AddUserPage'));
const AddPolicyPage = lazy(() => import('./pages/forms/AddPolicyPage'));
const NewTicketPage = lazy(() => import('./pages/forms/NewTicketPage'));
const AddGroupPage = lazy(() => import('./pages/forms/AddGroupPage'));
const GrantCompOffPage = lazy(() => import('./pages/forms/GrantCompOffPage'));
const AddModulePage = lazy(() => import('./pages/forms/AddModulePage'));
const AddRolePage = lazy(() => import('./pages/forms/AddRolePage'));
const AddSitePage = lazy(() => import('./pages/forms/AddSitePage'));
const QuickAddSitePage = lazy(() => import('./pages/forms/QuickAddSitePage'));
const AddTaskPage = lazy(() => import('./pages/forms/AddTaskPage'));
const NewUniformRequestPage = lazy(() => import('./pages/forms/NewUniformRequestPage'));

// Onboarding Form Steps
const PersonalDetails = lazy(() => import('./pages/onboarding/PersonalDetails'));
const AddressDetails = lazy(() => import('./pages/onboarding/AddressDetails'));
const OrganizationDetails = lazy(() => import('./pages/onboarding/OrganizationDetails'));
const FamilyDetails = lazy(() => import('./pages/onboarding/FamilyDetails'));
const EducationDetails = lazy(() => import('./pages/onboarding/EducationDetails'));
const BankDetails = lazy(() => import('./pages/onboarding/BankDetails'));
const UanDetails = lazy(() => import('./pages/onboarding/UanDetails'));
const EsiDetails = lazy(() => import('./pages/onboarding/EsiDetails'));
const GmcDetails = lazy(() => import('./pages/onboarding/GmcDetails'));
const UniformDetails = lazy(() => import('./pages/onboarding/UniformDetails'));
const Documents = lazy(() => import('./pages/onboarding/Documents'));
const Biometrics = lazy(() => import('./pages/onboarding/Biometrics'));
const Review = lazy(() => import('./pages/onboarding/Review'));

// Components
import ProtectedRoute from './components/auth/ProtectedRoute';
import { IdleTimeoutManager } from './components/auth/IdleTimeoutManager';
import ScrollToTop from './components/ScrollToTop';

// Theme Manager
const ThemeManager: React.FC = () => {
  const { theme, isAutomatic, _setThemeInternal } = useThemeStore();
  const isMobile = useMediaQuery('(max-width: 767px)');

  useEffect(() => {
    const body = document.body;
    let newTheme = 'light';

    if (isAutomatic) {
      newTheme = isMobile ? 'dark' : 'light';
    } else {
      newTheme = theme;
    }

    _setThemeInternal(newTheme as 'light' | 'dark');

    if (newTheme === 'dark') {
      body.classList.add('pro-dark-theme');
    } else {
      body.classList.remove('pro-dark-theme');
    }
  }, [theme, isAutomatic, isMobile, _setThemeInternal]);

  return null;
};

// Helper: keys & ignored routes for last-path storage
// We persist the last visited path in localStorage so it survives
// across browser reloads and tab closures.  This enables the app to
// return the user to the same page after a refresh or PWA relaunch.
const LAST_PATH_KEY = 'app:lastPath';
const IGNORED_PATH_PREFIXES = ['/auth', '/splash', '/pending-approval', '/forbidden'];

const shouldStorePath = (path: string) => {
  // ignore auth pages, splash, pending, forbidden or catch-all redirects
  // Also ignore the root path '/' to prevent getting stuck on the redirector
  if (path === '/' || path === '/#' || path === '/index.html') return false;
  return !IGNORED_PATH_PREFIXES.some(prefix => path.startsWith(prefix));
};

// This wrapper component protects all main application routes
const MainLayoutWrapper: React.FC = () => {
  const { user, isInitialized } = useAuthStore();
  const location = useLocation();
  // IMPORTANT: All hooks must be called before any conditional returns
  const isMobile = useMediaQuery('(max-width: 767px)');

  if (!isInitialized) {
    // Wait for the session check to complete.
    // Render a minimal component or null to prevent premature redirect.
    // Since Splash is commented out in App.tsx, we'll use null.
    return null;
  }

  if (!user) {
    // Not logged in, redirect to login
    // Store the current path before redirecting if it should be remembered.
    if (shouldStorePath(location.pathname + location.search)) {
      localStorage.setItem(LAST_PATH_KEY, location.pathname + location.search);
    }
    return <Navigate to="/auth/login" replace />;
  }
  if (user.role === 'unverified') {
    // Logged in but not approved, redirect to pending page
    return <Navigate to="/pending-approval" replace />;
  }
  // User is authenticated and verified, show the main layout and its nested routes
  // Use MobileLayout for mobile devices, MainLayout for desktop

  return isMobile ? <MobileLayout /> : <MainLayout />;
};

const App: React.FC = () => {
  const { user, isInitialized, setUser, setInitialized, resetAttendance, setLoading, isLoginAnimationPending } = useAuthStore();
  const { init: initEnrollmentRules } = useEnrollmentRulesStore();
  const { initRoles } = usePermissionsStore();
  const { initSettings } = useSettingsStore();

  const navigate = useNavigate();
  const location = useLocation();
  const { setDeferredPrompt } = usePWAStore();

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: any) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      console.log('Capture beforeinstallprompt event');
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, [setDeferredPrompt]);

  useEffect(() => {
    if (user && shouldStorePath(location.pathname + location.search)) {
      localStorage.setItem(LAST_PATH_KEY, location.pathname + location.search);
    }
  }, [user, location.pathname, location.search]);

  // Real-time attendance subscription
  useEffect(() => {
    if (user) {
      const unsubscribe = useAuthStore.getState().subscribeToAttendance();
      // Pre-fetch geofencing settings for faster attendance actions
      useAuthStore.getState().fetchGeofencingSettings();
      return () => {
        if (typeof unsubscribe === 'function') unsubscribe();
      };
    }
  }, [user]);

  // Initialization & Supabase session management
  useEffect(() => {
    // Flag to prevent state updates after unmount
    let isMounted = true;

    // Timer to force initialization complete after a grace period.
    // If Supabase is unreachable, we still allow the app to render the login page.
    const fallbackTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('App initialization is taking too long. Proceeding without a session.');
        setLoading(false);
        setInitialized(true);
      }
    }, 30000); // 30 seconds fallback

    const initializeApp = async () => {
      setLoading(true);
      try {
        let { data: { session }, error } = await supabase.auth.getSession();
        // If getSession returned an error, log it but continue.
        if (error) {
          console.error('Error fetching initial session:', error.message);
        }

        // 1. Check for long-term "Remember Me" token if no session is found
        // 1. Check for long-term "Remember Me" token if no session is found
        if (!session) {
          const { value: refreshToken } = await Preferences.get({ key: 'supabase.auth.rememberMe' });
          if (refreshToken) {
            console.log('Attempting to restore session from long-term token...');
            try {
              const { data: refreshData, error: refreshError } = await supabase.auth.setSession({ refresh_token: refreshToken } as any);
              if (refreshError) {
                console.error('Failed to restore session from long-term token:', refreshError.message);
                await Preferences.remove({ key: 'supabase.auth.rememberMe' });
              } else {
                session = refreshData.session;
              }
            } catch (e) {
              console.error('Exception while restoring session from long-term token:', e);
            }
          }
        }

        // 2. Process the final session state
        if (session) {
          try {
            const appUser = await authService.getAppUserProfile(session.user);
            if (isMounted) setUser(appUser);
          } catch (e) {
            console.error('Failed to fetch user profile during initialization:', e);
            if (isMounted) {
              setUser(null);
              resetAttendance();
            }
          }
        } else {
          if (isMounted) {
            setUser(null);
            resetAttendance();
          }
        }
      } catch (error) {
        console.error('Error during app initialization:', error);
        if (isMounted) {
          setUser(null);
          resetAttendance();
        }
      } finally {
        // Only clear the fallback timeout if initialization finishes before the fallback time
        clearTimeout(fallbackTimeout);
        if (isMounted) {
          setLoading(false);
          setInitialized(true);
        }
      }
    };

    initializeApp();

    // Listen for subsequent auth changes (e.g., login, logout)
    //
    // NOTE: The Supabase client can hang indefinitely if asynchronous
    // operations are performed directly inside the onAuthStateChange
    // callback.  See: https://github.com/orgs/supabase/discussions/37755
    // To avoid this, do not await other Supabase calls in the callback
    // itself.  Instead, schedule any async work on the next event loop
    // tick via setTimeout().  This ensures the callback returns
    // immediately and prevents the client from locking up when tabs are
    // switched or refreshed.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/auth/update-password', { replace: true });
        return;
      }

      // Handle Token Updates for Persistence
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session) {
          try {
            // Check if we need to update the persistent token
            const isMobile = Capacitor.isNativePlatform();
            // On mobile, we always persist. On web, only if the key already exists (user opted in)
            const { value: existingToken } = await Preferences.get({ key: 'supabase.auth.rememberMe' });
            
            if (isMobile || existingToken) {
              await Preferences.set({ 
                key: 'supabase.auth.rememberMe', 
                value: session.refresh_token 
              });
              // Also sync email if needed
              if (session.user.email) {
                 await Preferences.set({ key: 'rememberedEmail', value: session.user.email });
              }
            }
          } catch (err) {
            console.error('Error synchronizing auth token:', err);
          }
        }
      }

      if (session?.user) {
        // schedule fetching the full profile after the callback returns
        setTimeout(async () => {
          try {
            const appUser = await authService.getAppUserProfile(session.user);
            if (isMounted) {
              setUser(appUser);
              // Send a one‑time greeting notification when a user logs in via OAuth or any method
              if (appUser) {
                try {
                  const greetKey = `greetingSent_${appUser.id}`;
                  if (!localStorage.getItem(greetKey)) {
                    await apiService.createNotification({
                      userId: appUser.id,
                      message: `Good morning, ${appUser.name || 'there'}! Welcome to Paradigm Services.`,
                      type: 'greeting',
                    });
                    localStorage.setItem(greetKey, '1');
                  }
                } catch (err) {
                  console.error('Failed to send login greeting notification', err);
                }
              }
            }
          } catch (err) {
            console.error('Failed to fetch user profile after auth change:', err);
            if (isMounted) {
              setUser(null);
              resetAttendance();
              useOnboardingStore.getState().reset();
            }
          }
        }, 0);
      } else {
        // If no session, clear the user immediately
        if (isMounted) {
          setUser(null);
          resetAttendance();
          useOnboardingStore.getState().reset();
        }
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
      clearTimeout(fallbackTimeout);
    };
  }, [setUser, setInitialized, resetAttendance, setLoading]);

  // Fetch initial app data on user login
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        const { settings, roles, holidays } = await apiService.getInitialAppData();
        const recurringHolidays = await apiService.getRecurringHolidays();

        if (settings.enrollmentRules) {
          initEnrollmentRules(settings.enrollmentRules);
        }
        if (roles) {
          initRoles(roles);
        }
        if (settings.attendanceSettings && holidays) {
          initSettings({
            holidays: holidays,
            attendanceSettings: settings.attendanceSettings,
            recurringHolidays: recurringHolidays || []
          });
        }
      } catch (error) {
        console.error('Failed to load initial application data:', error);
      }
    };

    if (user && isInitialized) { // Ensure we only fetch after initialization is complete
      fetchInitialData();
      useAuthStore.getState().checkAttendanceStatus();
    }
  }, [user, isInitialized, initEnrollmentRules, initRoles, initSettings]);

  // Post-initialization navigation logic.
  useEffect(() => {
    if (!isInitialized) {
      return; // Wait for the session check to complete.
    }

    // This effect handles cases where a logged-in user is landing on a non-app page
    // such as the auth routes, the splash screen, or the root ("/").  In these
    // situations we check if we have a last known path in localStorage and
    // navigate there.  This ensures that refreshing the browser or reopening
    // the app returns the user to the page they were last working on.  If no
    // last path is stored, we send the user to their profile page.
    // We also check isLoginAnimationPending to allow the login page to show a success animation.

    // IMPORTANT: Allow users to stay on /auth/update-password to set their new password
    // after clicking a password reset link
    if (location.pathname === '/auth/update-password') {
      return; // Don't redirect, let them set their password
    }

    if (user && !isLoginAnimationPending && (
      (location.pathname.startsWith('/auth') && location.pathname !== '/auth/logout') ||
      location.pathname === '/' ||
      location.pathname === '/splash'
    )) {
      const lastPath = localStorage.getItem(LAST_PATH_KEY);
      // Only use lastPath if it exists AND is not the root path itself
      if (lastPath && shouldStorePath(lastPath) && lastPath !== '/' && lastPath !== '/#') {
        localStorage.removeItem(LAST_PATH_KEY); // Clear after use
        navigate(lastPath, { replace: true });
      } else {
        if (user.role === 'unverified') {
          navigate('/pending-approval', { replace: true });
        } else {
          navigate('/profile', { replace: true });
        }
      }
    }
  }, [isInitialized, user, location.pathname, navigate, isLoginAnimationPending]);


  // While the initial authentication check is running, show the splash screen.
  // This prevents the router from rendering and making incorrect navigation decisions.
  if (!isInitialized) {
    // Temporarily disabled splash screen by commenting out the return.
    return <Splash />;
  }

  // Once initialized, render the main application structure.
  return (
    <>
      <ScrollToTop />
      <ThemeManager />
      {user && <IdleTimeoutManager />}
      <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div></div>}>
      <Routes>
        {/* 1. Public Authentication Routes */}
        <Route path="/auth" element={<AuthLayout />}>
          <Route index element={<Navigate to="login" replace />} />
          <Route path="login" element={<Login />} />
          <Route path="signup" element={<SignUp />} />
          <Route path="forgot-password" element={<ForgotPassword />} />
          <Route path="update-password" element={<UpdatePassword />} />
          <Route path="logout" element={<LogoutPage />} />
        </Route>

        {/* 2. Page for unverified users */}
        <Route path="/pending-approval" element={user && user.role === 'unverified' ? <PendingApproval /> : <Navigate to="/auth/login" replace />} />

        {/* 3. Forbidden page for unauthorized access */}
        <Route path="/forbidden" element={<Forbidden />} />

        {/* 4. All protected main application routes are nested here */}
        <Route path="/" element={
          <SecurityWrapper>
            <MainLayoutWrapper />
          </SecurityWrapper>
        }>
          {/* Default route for authenticated users */}
          <Route index element={<Navigate to="/profile" replace />} />

          <Route element={<ProtectedRoute requiredPermission="view_profile" />}>
            <Route path="profile" element={<ProfilePage />} />
          </Route>
          <Route path="mobile-home" element={<MobileHome />} />

          {/* Onboarding Flow */}
          <Route element={<ProtectedRoute requiredPermission="create_enrollment" />}>
            <Route path="onboarding" element={<OnboardingHome />} />
            <Route path="onboarding/select-organization" element={<SelectOrganization />} />
            <Route path="onboarding/pre-upload" element={<PreUpload />} />
            <Route path="onboarding/submissions" element={<MySubmissions />} />
            <Route path="onboarding/tasks" element={<MyTasks />} />
            <Route path="onboarding/uniforms" element={<UniformRequests />} />
            <Route path="onboarding/add" element={<AddEmployee />}>
              <Route path="personal" element={<PersonalDetails />} />
              <Route path="address" element={<AddressDetails />} />
              <Route path="organization" element={<OrganizationDetails />} />
              <Route path="family" element={<FamilyDetails />} />
              <Route path="education" element={<EducationDetails />} />
              <Route path="bank" element={<BankDetails />} />
              <Route path="uan" element={<UanDetails />} />
              <Route path="esi" element={<EsiDetails />} />
              <Route path="gmc" element={<GmcDetails />} />
              <Route path="uniform" element={<UniformDetails />} />
              <Route path="documents" element={<Documents />} />
              <Route path="biometrics" element={<Biometrics />} />
              <Route path="review" element={<Review />} />
            </Route>
            <Route path="onboarding/pdf/:id" element={<OnboardingPdfOutput />} />
          </Route>

          {/* Verification */}
          <Route element={<ProtectedRoute requiredPermission="view_all_submissions" />}>
            <Route path="verification/dashboard" element={<VerificationDashboard />} />
          </Route>

          {/* Admin */}
          <Route element={<ProtectedRoute requiredPermission="manage_users" />}>
            <Route path="admin/users" element={<UserManagement />} />
            <Route path="admin/users/add" element={<AddUserPage />} />
            <Route path="admin/users/edit/:id" element={<AddUserPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_biometric_devices" />}>
            <Route path="admin/devices" element={<ManageDevices />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_sites" />}>
            <Route path="admin/sites" element={<SiteManagement />} />
            <Route path="admin/sites/add" element={<AddSitePage />} />
            <Route path="admin/sites/quick-add" element={<QuickAddSitePage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_roles_and_permissions" />}>
            <Route path="admin/roles" element={<RoleManagement />} />
            <Route path="admin/roles/add" element={<AddRolePage />} />
            <Route path="admin/roles/edit/:id" element={<AddRolePage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_modules" />}>
            <Route path="admin/modules" element={<ModuleManagement />} />
            <Route path="admin/modules/add" element={<AddModulePage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_approval_workflow" />}>
            <Route path="admin/approval-workflow" element={<ApprovalWorkflow />} />
            <Route path="admin/approval-workflow/chart" element={<WorkflowChartFullScreen />} />
          </Route>

          {/* Developer */}
          <Route element={<ProtectedRoute requiredPermission="view_developer_settings" />}>
            <Route path="developer/api" element={<ApiSettings />} />
          </Route>

          {/* Operations & Site */}
          <Route element={<ProtectedRoute requiredPermission="view_operations_dashboard" />}>
            <Route path="operations/dashboard" element={<OperationsDashboard />} />
            <Route path="operations/team-activity" element={<TeamActivity />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="view_my_team" />}>
            <Route path="my-team" element={<MyTeam />} />
            <Route path="my-team/reporting" element={<ReportingStructure />} />
            <Route path="my-team/:id" element={<TeamMemberProfile />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="view_field_reports" />}>
            <Route path="my-team/field-reports" element={<FieldReports />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="view_site_dashboard" />}>
            <Route path="site/dashboard" element={<SiteDashboard />} />
          </Route>

          {/* Attendance & Leave */}
          <Route element={<ProtectedRoute requiredPermission="view_own_attendance" />}>
            <Route path="attendance/dashboard" element={<AttendanceDashboard />} />
            <Route path="attendance/check-in" element={<AttendanceActionPage />} />
            <Route path="attendance/check-out" element={<AttendanceActionPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="view_my_locations" />}>
            {/* New page for users to manage their own geofenced locations */}
            <Route path="attendance/locations" element={<MyLocations />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="apply_for_leave" />}>
            <Route path="leaves/dashboard" element={<LeaveDashboard />} />
          </Route>

          {/* HR */}
          <Route element={<ProtectedRoute requiredPermission="manage_attendance_rules" />}>
            <Route path="hr/attendance-settings" element={<AttendanceSettings />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_leave_requests" />}>
            <Route path="hr/leave-management" element={<LeaveManagement />} />
            <Route path="hr/leave-management/grant-comp-off" element={<GrantCompOffPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="view_entity_management" />}>
            <Route path="hr/entities" element={<EntityManagement />} />
            <Route path="hr/entity-management/add-group" element={<AddGroupPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_policies" />}>
            <Route path="hr/policies-and-insurance" element={<PoliciesAndInsurance />} />
            <Route path="hr/policies/add" element={<AddPolicyPage />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="manage_enrollment_rules" />}>
            <Route path="hr/enrollment-rules" element={<EnrollmentRules />} />
            <Route path="hr/field-staff-tracking" element={<ProtectedRoute requiredPermission="view_field_staff_tracking"><FieldStaffTracking /></ProtectedRoute>} />
          </Route>

          {/* Location Management (Geofencing) */}
          <Route element={<ProtectedRoute requiredPermission="manage_geo_locations" />}>
            <Route path="hr/locations" element={<LocationManagement />} />
          </Route>

          {/* Uniforms */}
          <Route element={<ProtectedRoute requiredPermission="manage_uniforms" />}>
            <Route path="uniforms" element={<UniformDashboard />} />
            <Route path="uniforms/request/new" element={<NewUniformRequestPage />} />
            <Route path="uniforms/request/edit/:id" element={<NewUniformRequestPage />} />
          </Route>

          {/* Billing */}
          <Route element={<ProtectedRoute requiredPermission="view_verification_costing" />}>
            <Route path="billing/cost-analysis" element={<CostAnalysis />} />
          </Route>
          <Route element={<ProtectedRoute requiredPermission="view_invoice_summary" />}>
            <Route path="billing/summary" element={<InvoiceSummary />} />
          </Route>

          {/* Tasks */}
          <Route element={<ProtectedRoute requiredPermission="manage_tasks" />}>
            <Route path="tasks" element={<Tasks />} />
            <Route path="tasks/add" element={<AddTaskPage />} />
            <Route path="tasks/edit/:id" element={<AddTaskPage />} />
          </Route>

          {/* Support */}
          <Route element={<ProtectedRoute requiredPermission="access_support_desk" />}>
            <Route path="support" element={<SupportDashboard />} />
            <Route path="support/ticket/new" element={<NewTicketPage />} />
            <Route path="support/ticket/:id" element={<TicketDetail />} />
          </Route>
        </Route>

        {/* 5. Catch-all: Redirects any unknown paths */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
    </>
  );
};

export default App;
