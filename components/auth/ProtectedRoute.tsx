import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { usePermissionsStore } from '../../store/permissionsStore';
import type { Permission } from '../../types';

import { isAdmin } from '../../utils/auth';

interface ProtectedRouteProps {
  requiredPermission: Permission;
  children?: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ requiredPermission, children }) => {
  const { user, isInitialized } = useAuthStore();
  // Subscribe to the entire permissions object for reactivity.
  // When this object changes in the store, this component will re-render.
  const { permissions } = usePermissionsStore();

  if (!isInitialized) {
    // Wait for the session check to complete.
    return null;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace />;
  }

  // Normalize the user's role to match the keys in our permissions store (which are lowercase)
  const normalizedRole = user.role?.toLowerCase() || '';
  const userPermissions = permissions[normalizedRole] || permissions[user.role] || [];
  const hasAccess = isAdmin(user.role) || userPermissions.includes(requiredPermission);

  if (!hasAccess) {
    // User does not have the required permission, redirect to a forbidden page
    return <Navigate to="/forbidden" replace />;
  }

  // If `children` are provided, render them. Otherwise, render the outlet for nested routes.
  return children ? <>{children}</> : <Outlet />;
};

export default ProtectedRoute;