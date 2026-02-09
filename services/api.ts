import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseAnonKey } from './supabase';
import type {
  OnboardingData, User, Organization, OrganizationGroup, AttendanceEvent, Location, AttendanceSettings, Holiday,
  LeaveBalance, LeaveRequest, Task, Notification, SiteConfiguration, Entity, Policy, Insurance,
  ManpowerDetail, BackOfficeIdSeries, SiteStaffDesignation, Asset, MasterTool, MasterToolsList,
  SiteGentsUniformConfig, MasterGentsUniforms, SiteLadiesUniformConfig, MasterLadiesUniforms, UniformRequest,
  SiteUniformDetailsConfig, EnrollmentRules, InvoiceData, UserRole, UploadedFile, SalaryChangeRequest, SiteStaff,
  SubmissionCostBreakdown, AppModule, Role, SupportTicket, TicketPost, TicketComment, VerificationResult, CompOffLog,
  ExtraWorkLog, PerfiosVerificationData, HolidayListItem, UniformRequestItem, IssuedTool, RecurringHolidayRule,
  BiometricDevice, ChecklistTemplate, FieldReport, FieldAttendanceViolation,
  NotificationRule, NotificationType, Company, GmcPolicySettings, StaffAttendanceRules,
  GmcSubmission, UserHoliday
} from '../types';
// FIX: Add 'startOfMonth' and 'endOfMonth' to date-fns import to resolve errors.
import { 
  differenceInCalendarDays, format, startOfMonth, endOfMonth, 
  startOfDay, endOfDay, eachDayOfInterval, isSameDay, getDay
} from 'date-fns';
import { dispatchNotificationFromRules } from './notificationService';
import { calculateSiteTravelTime, validateFieldStaffAttendance } from '../utils/fieldStaffTracking';
import { GoogleGenAI, Type, Modality } from '@google/genai';
import { createWorker } from 'tesseract.js';

const ONBOARDING_DOCS_BUCKET = 'onboarding-documents';
const AVATAR_BUCKET = 'avatars';
const SUPPORT_ATTACHMENTS_BUCKET = 'support-attachments';
// Buckets for storing branding assets.  These buckets should be created
// in your Supabase project via the Storage interface.  The `logo`
// bucket stores the active and default logos displayed throughout the
// application.  The `background` bucket stores the carousel images for
// the login screen.  Policies should permit public read and
// authenticated upload/update/delete.
const LOGO_BUCKET = 'logo';
const BACKGROUND_BUCKET = 'background';

// Bucket used to store attachments uploaded when marking tasks complete.  If this
// bucket does not already exist in your Supabase project, create it via the
// Supabase web console or CLI.  All task completion photos will be stored
// here.  Alternatively you can reuse SUPPORT_ATTACHMENTS_BUCKET if you prefer.
const TASK_ATTACHMENTS_BUCKET = 'task-attachments';

// Resolve the Google GenAI API key from Vite environment variables.  When running
// locally without a real key, the application should still boot and render
// normally; AI-powered features will be disabled.  If a key is provided, the
// GoogleGenAI client is instantiated for use by downstream functions.  If the
// key is missing, log a warning and set `ai` to null.  Downstream functions
// should check for a null `ai` and provide sensible fallbacks rather than
// throwing.
const apiKey = import.meta.env.VITE_API_KEY;
let ai: GoogleGenAI | null = null;
if (!apiKey) {
  console.warn(
    "VITE_API_KEY for Google GenAI is not set in the environment variables. " +
    "AI-powered features (document extraction, name cross‑verification, fingerprint detection, document enhancement) will be disabled."
  );
} else {
  ai = new GoogleGenAI({ apiKey });
}

// --- Location Constants & Helpers ---

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

const CITY_NAME_MAP: Record<string, string> = {
  'Bangalore': 'Bengaluru',
  'Mysore': 'Mysuru',
  'Mangalore': 'Mangaluru',
  'Vizag': 'Visakhapatnam',
  'Hydrabat': 'Hyderabad',
  'Cochin': 'Kochi'
};

const CITY_TO_STATE_MAP: Record<string, string> = {
  'Hyderabad': 'Telangana',
  'Secunderabad': 'Telangana',
  'Warangal': 'Telangana',
  'Nizamabad': 'Telangana',
  'Bengaluru': 'Karnataka',
  'Hubballi': 'Karnataka',
  'Dharwad': 'Karnataka',
  'Mysuru': 'Karnataka',
  'Mangaluru': 'Karnataka',
  'Mumbai': 'Maharashtra',
  'Pune': 'Maharashtra',
  'Chennai': 'Tamil Nadu',
  'Delhi': 'Delhi',
  'New Delhi': 'Delhi',
  'Kochi': 'Kerala',
  'Visakhapatnam': 'Andhra Pradesh',
  'Vijayawada': 'Andhra Pradesh'
};

const normalizeStateName = (str: string) => {
  if (!str) return '';
  const n = str.trim();
  if (n.toLowerCase() === 'telugana') return 'Telangana';
  return n;
};


// --- Helper Functions ---

const processUrlsForDisplay = (obj: any): any => {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(processUrlsForDisplay);

  const newObj = { ...obj };
  // Check if the object looks like our UploadedFile structure with a path
  if (typeof newObj.name === 'string' && typeof newObj.path === 'string') {
    const bucket = newObj.path.startsWith('avatars/') ? AVATAR_BUCKET : ONBOARDING_DOCS_BUCKET;
    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(newObj.path);
    newObj.preview = publicUrl;
    newObj.url = publicUrl;
  }

  // Recursively process nested objects
  for (const key in newObj) {
    newObj[key] = processUrlsForDisplay(newObj[key]);
  }
  return newObj;
};

/**
 * Recursively process a mixed object structure and upload any File objects to
 * Supabase Storage.  For each file encountered, the file is uploaded to the
 * onboarding documents bucket and a corresponding record is inserted into
 * the user_documents table.  The returned object mirrors the input but
 * replaces File objects with plain metadata objects containing name,
 * type, size and the storage path.  If the input contains nested arrays
 * or objects, those structures are preserved.
 *
 * @param obj        Arbitrary object containing primitive values or nested
 *                   objects/arrays.  Any property named `file` with a
 *                   File instance will be uploaded.
 * @param userId     The ID of the user uploading the file.  Used to
 *                   construct storage paths and associate the document with
 *                   the user_documents table.
 * @param submissionId The onboarding submission ID; helps group files by
 *                   submission when provided.  May be an empty string.
 */
const processFilesForUpload = async (obj: any, userId: string, submissionId: string): Promise<any> => {
  if (obj === null || typeof obj !== 'object') return obj;
  // Handle arrays by processing each element
  if (Array.isArray(obj)) {
    return Promise.all(obj.map(item => processFilesForUpload(item, userId, submissionId)));
  }

  const newObj: any = { ...obj };
  // If the object has a File to upload
  if (newObj.file instanceof File) {
    const file: File = newObj.file;
    // Construct a unique storage path using the userId and submissionId
    const filePath = `${userId}/documents/${Date.now()}_${file.name}`;
    // Upload the file to the onboarding documents bucket
    const { error: uploadError } = await supabase.storage.from(ONBOARDING_DOCS_BUCKET).upload(filePath, file);
    if (uploadError) throw uploadError;
    // Insert a record into the user_documents table.  Use a best‑effort
    // approach so the insert failing doesn't block the upload.
    try {
      await supabase.from('user_documents').insert({
        user_id: userId,
        submission_id: submissionId || null,
        name: newObj.name || file.name,
        bucket: ONBOARDING_DOCS_BUCKET,
        path: filePath,
        file_type: file.type,
        file_size: file.size,
      });
    } catch (insertErr) {
      console.error('Failed to record uploaded document:', insertErr);
    }
    // Replace with metadata object that will be stored in the submission JSON
    return {
      name: newObj.name || file.name,
      type: file.type,
      size: file.size,
      path: filePath,
    };
  }
  // If object already has name and path, treat as existing file metadata
  if (typeof newObj.name === 'string' && newObj.path) {
    return {
      name: newObj.name,
      type: newObj.type,
      size: newObj.size,
      path: newObj.path,
    };
  }
  // Recursively process nested properties
  for (const key in newObj) {
    if (Object.prototype.hasOwnProperty.call(newObj, key)) {
      newObj[key] = await processFilesForUpload(newObj[key], userId, submissionId);
    }
  }
  return newObj;
};

const dataUrlToBlob = async (dataUrl: string) => {
  const res = await fetch(dataUrl);
  return await res.blob();
};

const toSnakeCase = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map(item => toSnakeCase(item));
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date) && !(data instanceof File)) {
    const snaked: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        snaked[snakeKey] = toSnakeCase(data[key]);
      }
    }
    return snaked;
  }
  return data;
};

const toCamelCase = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map(item => toCamelCase(item));
  }
  if (data !== null && typeof data === 'object' && !(data instanceof Date)) {
    const camelCased: Record<string, any> = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        const camelKey = key.replace(/_([a-z])/g, g => g[1].toUpperCase());
        camelCased[camelKey] = toCamelCase(data[key]);
      }
    }
    return processUrlsForDisplay(camelCased);
  }
  return data;
};

/**
 * Helper to fetch all pages from a Supabase query.
 * Bypasses the default 1000-row limit by paginating until all records are retrieved.
 */
const fetchAll = async <T,>(queryBuilder: any, pageSize = 1000): Promise<T[]> => {
  let allData: T[] = [];
  let from = 0;
  let to = pageSize - 1;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(from, to);
    if (error) throw error;
    
    if (data && data.length > 0) {
      allData = allData.concat(data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
        to += pageSize;
      }
    } else {
      hasMore = false;
    }
  }
  return allData;
};

export const api = {
  toSnakeCase,
  toCamelCase,
  // --- Initial Data Loading ---
  getInitialAppData: async (): Promise<{ settings: any; roles: Role[]; holidays: Holiday[] }> => {
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .select('*')
      .eq('id', 'singleton')
      .maybeSingle();
    if (settingsError) throw new Error('Failed to fetch core application settings.');
    if (!settingsData) throw new Error('Core application settings are missing from the database.');

    const { data: rolesData, error: rolesError } = await supabase.from('roles').select('*');
    if (rolesError) throw new Error('Failed to fetch user roles.');

    const { data: holidaysData, error: holidaysError } = await supabase.from('holidays').select('*');
    if (holidaysError) throw new Error('Failed to fetch holidays.');

    return {
      settings: toCamelCase(settingsData),
      roles: (rolesData || []).map(toCamelCase),
      holidays: (holidaysData || []).map(toCamelCase),
    };
  },

    // --- Settings ---
  updateAttendanceSettings: async (settings: AttendanceSettings): Promise<void> => {
    // Determine the ID to update. Singleton is usually 'singleton' or a specific ID.
    // Based on getInitialAppData, it fetches where id='singleton'.
    const { error } = await supabase
      .from('settings')
      .update(toSnakeCase(settings))
      .eq('id', 'singleton');

    if (error) throw error;
  },

  // --- Onboarding & Verification ---
  getVerificationSubmissions: async (status?: string, organizationId?: string): Promise<OnboardingData[]> => {
    let query = supabase.from('onboarding_submissions').select('*');
    if (status) query = query.eq('status', status);
    if (organizationId) query = query.eq('organization_id', organizationId);
    const { data, error } = await query.order('created_at', { ascending: false }).limit(5000);
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },

  getOnboardingDataById: async (id: string): Promise<OnboardingData | null> => {
    const { data, error } = await supabase.from('onboarding_submissions').select('*').eq('id', id).single();
    if (error && error.code !== 'PGRST116') throw error;
    return data ? toCamelCase(data) : null;
  },

  _saveSubmission: async (data: OnboardingData, asDraft: boolean): Promise<{ draftId: string }> => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw new Error("User not authenticated");

    const submissionId = (data.id && !data.id.startsWith('draft_')) ? data.id : crypto.randomUUID();
    const dataWithPaths = await processFilesForUpload(data, session.user.id, submissionId);

    const snakedData = toSnakeCase(dataWithPaths);
    
    const dbData = {
      ...snakedData,
      id: submissionId,
      user_id: session.user.id,
      employee_id: data.personal?.employeeId || null,
      status: asDraft ? 'draft' : data.status,
    };

    // Remove any client-side only properties that don't have columns
    delete dbData.file;
    delete dbData.confirm_account_number;
    delete (dbData as any).is_qr_verified; // Guard against legacy state

    const { data: savedData, error } = await supabase.from('onboarding_submissions').upsert(dbData, { onConflict: 'id' }).select('id').single();
    if (error) {
        console.error('Save submission error:', error);
        throw error;
    }
    return { draftId: savedData.id };
  },

  saveDraft: async (data: OnboardingData) => api._saveSubmission(data, true),

  submitGmcPublicForm: async (data: any) => {
    const { error } = await supabase.from('gmc_form_submissions').insert([toSnakeCase(data)]);
    if (error) throw error;
  },

  getGMCRates: async (): Promise<{ id: number, minAge: number, maxAge: number, rate: number }[]> => {
    const { data, error } = await supabase
        .from('gmc_rates')
        .select('*')
        .order('min_age', { ascending: true });
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },

  updateGMCRate: async (id: number, updates: { minAge?: number, maxAge?: number, rate?: number }): Promise<void> => {
    const { error } = await supabase
        .from('gmc_rates')
        .update(toSnakeCase(updates))
        .eq('id', id);
    if (error) throw error;
  },

  addGMCRate: async (rateData: { minAge: number, maxAge: number, rate: number }): Promise<void> => {
    const { error } = await supabase
        .from('gmc_rates')
        .insert([toSnakeCase(rateData)]);
    if (error) throw error;
  },

  deleteGMCRate: async (id: number): Promise<void> => {
    const { error } = await supabase
        .from('gmc_rates')
        .delete()
        .eq('id', id);
    if (error) throw error;
  },

  getGmcSubmissions: async (filters?: { 
    name?: string, 
    site?: string, 
    role?: string, 
    company?: string,
    minAge?: number,
    maxAge?: number,
    maritalStatus?: string,
    startDate?: string,
    endDate?: string,
    page?: number,
    limit?: number 
  }): Promise<{ data: GmcSubmission[], total: number }> => {
    const { 
      name, site, role, company, 
      minAge, maxAge, maritalStatus,
      startDate, endDate,
      page, limit 
    } = filters || {};
    let query = supabase.from('gmc_form_submissions').select('*', { count: 'exact' });

    if (name) query = query.ilike('employee_name', `%${name}%`);
    if (site) query = query.eq('site_name', site);
    // Role is not explicitly in the GMCForm data but can be searched in the employee_name/details if needed.
    // However, the user asked for "search by name,site,role,etc". 
    // I'll assume role might be added later or we search in related user data if available.
    // For now, I'll filter by the fields we have.
    if (company) query = query.eq('company_name', company);
    if (maritalStatus) query = query.eq('marital_status', maritalStatus);

    if (minAge !== undefined || maxAge !== undefined) {
      const today = new Date();
      if (maxAge !== undefined) {
        // maxAge 30 means DOB must be >= (Today - 31 years + 1 day)
        const minDob = new Date(today.getFullYear() - maxAge - 1, today.getMonth(), today.getDate() + 1);
        query = query.gte('dob', format(minDob, 'yyyy-MM-dd'));
      }
      if (minAge !== undefined) {
        // minAge 18 means DOB must be <= (Today - 18 years)
        const maxDob = new Date(today.getFullYear() - minAge, today.getMonth(), today.getDate());
        query = query.lte('dob', format(maxDob, 'yyyy-MM-dd'));
      }
    }

    if (startDate) {
      query = query.gte('updated_at', startOfDay(new Date(startDate)).toISOString());
    }
    if (endDate) {
      query = query.lte('updated_at', endOfDay(new Date(endDate)).toISOString());
    }

    const currentPage = page || 1;
    const currentLimit = limit || 10;
    const isExport = limit === -1;

    if (!isExport) {
        const from = (currentPage - 1) * currentLimit;
        const to = from + currentLimit - 1;
        query = query.range(from, to);
    }

    const { data, error, count } = await query
      .order('updated_at', { ascending: false });

    if (error) throw error;
    return {
      data: (data || []).map(toCamelCase),
      total: count || 0
    };
  },

  getEntities: async (): Promise<Entity[]> => {
    const { data, error } = await supabase.from('entities').select('*').order('name');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },

  getGroups: async (): Promise<OrganizationGroup[]> => {
    const { data, error } = await supabase.from('organization_groups').select('*').order('name');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },

  submitOnboarding: async (data: OnboardingData) => {
    const { draftId } = await api._saveSubmission(data, false);
    const submittedData = await api.getOnboardingDataById(draftId);
    if (!submittedData) throw new Error("Failed to retrieve submitted data.");
    
    // Trigger rule-based notification
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
        dispatchNotificationFromRules('onboarding_submitted', {
            actorName: data.personal.firstName + ' ' + data.personal.lastName,
            actionText: 'has submitted a new enrollment',
            locString: '',
            actor: { id: user.id, name: user.email || 'Admin', role: 'admin' }
        });
    }
    
    return submittedData;
  },

  updateOnboarding: async (data: OnboardingData) => {
    const { draftId } = await api._saveSubmission(data, data.status === 'draft');
    const updatedData = await api.getOnboardingDataById(draftId);
    if (!updatedData) throw new Error("Failed to retrieve updated data.");
    return updatedData;
  },

  verifySubmission: async (id: string): Promise<void> => {
    const { error } = await supabase.from('onboarding_submissions').update({ status: 'verified', portal_sync_status: 'pending_sync' }).eq('id', id);
    if (error) throw error;
    
    // Trigger notification
    const submission = await api.getOnboardingDataById(id);
    const { data: { user } } = await supabase.auth.getUser();
    if (submission && user) {
        dispatchNotificationFromRules('onboarding_verified', {
            actorName: 'Enrollment for ' + (submission.personal as any).firstName,
            actionText: 'has been verified',
            locString: '',
            actor: { id: user.id, name: user.email || 'Admin', role: 'admin' }
        });
    }
  },

  requestChanges: async (id: string, reason: string): Promise<void> => {
    const { error } = await supabase.from('onboarding_submissions').update({ status: 'rejected' }).eq('id', id);
    if (error) throw error;
    
    // Trigger notification
    const submission = await api.getOnboardingDataById(id);
    const { data: { user } } = await supabase.auth.getUser();
    if (submission && user) {
        dispatchNotificationFromRules('onboarding_rejected', {
            actorName: 'Enrollment for ' + (submission.personal as any).firstName,
            actionText: 'has been rejected (changes requested)',
            locString: '',
            actor: { id: user.id, name: user.email || 'Admin', role: 'admin' }
        });
    }
  },

  syncPortals: async (id: string): Promise<OnboardingData> => {
    const { data, error } = await supabase.functions.invoke('sync-portals', { body: { submissionId: id } });
    if (error) throw error;
    return toCamelCase(data);
  },

  deleteFile: async (filePath: string): Promise<void> => {
    const { error } = await supabase.storage.from(ONBOARDING_DOCS_BUCKET).remove([filePath]);
    if (error) throw error;
  },

  /**
   * Upload a single file to Supabase Storage.  The default bucket is
   * `ONBOARDING_DOCS_BUCKET`, but a different bucket can be specified if
   * necessary (for example when uploading attachments for tasks or support
   * tickets).  After uploading the file, the public URL is returned along
   * with the storage path.  This helper will also create an entry in
   * the `user_documents` table recording the upload, allowing CRUD
   * operations on uploaded documents through the database.  The
   * `submissionId` and `docName` parameters are optional; when provided
   * they are stored in the user_documents table for additional context.
   *
   * @param file     The File object to upload
   * @param bucket   The storage bucket to upload to
   * @param submissionId (optional) ID of the related onboarding submission
   * @param docName  (optional) descriptive name of the document (e.g. 'idProofFront')
   */
  uploadDocument: async (
    file: File,
    bucket: string = ONBOARDING_DOCS_BUCKET,
    submissionId?: string,
    docName?: string
  ): Promise<{ url: string; path: string; }> => {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id || 'anonymous_user';
    const filePath = `${userId}/documents/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage.from(bucket).upload(filePath, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (!data.publicUrl) throw new Error('Could not get public URL for uploaded file.');

    // Record the uploaded document in the user_documents table.  Use a try/catch
    // so that even if this insert fails, the upload will still succeed.
    try {
      await supabase.from('user_documents').insert({
        user_id: userId,
        submission_id: submissionId || null,
        name: docName || file.name,
        bucket,
        path: filePath,
        file_type: file.type,
        file_size: file.size,
      });
    } catch (e) {
      console.error('Failed to insert user_documents record:', e);
    }
    return { url: data.publicUrl, path: filePath };
  },

  bulkUpdateUserLeaves: async (updates: { id: string; earned_leave_opening_balance: number; earned_leave_opening_date: string }[]): Promise<void> => {
    // Use individual updates to avoid not-null constraint errors on other columns
    for (const update of updates) {
      const { error } = await supabase
        .from('users')
        .update({
          earned_leave_opening_balance: update.earned_leave_opening_balance,
          earned_leave_opening_date: update.earned_leave_opening_date
        })
        .eq('id', update.id);
      if (error) throw error;
    }
  },


  // --- Users & Orgs ---
  getUsers: async (filter?: { page?: number, pageSize?: number }): Promise<any> => {
    let query = supabase.from('users').select('*, role_id', { count: 'exact' });
    
    const isPaginated = filter?.page !== undefined && filter?.pageSize !== undefined;
    if (isPaginated) {
      const from = (filter!.page! - 1) * filter!.pageSize!;
      const to = from + filter!.pageSize! - 1;
      query = query.range(from, to);
    }
    
    const { data, count, error } = await query;
    if (error) throw error;
    
    const formattedData = (data || []).map(u => toCamelCase({ ...u, role: u.role_id }));
    
    if (isPaginated) {
      return { data: formattedData, total: count || 0 };
    }
    return formattedData;
  },

  getUserHolidays: async (userId: string): Promise<UserHoliday[]> => {
    const { data, error } = await supabase
      .from('user_holidays')
      .select('*')
      .eq('user_id', userId);
    if (error && error.code !== 'PGRST116') {
      // If table doesn't exist yet, we'll return empty array and log error
      console.warn("User holidays table might not exist:", error);
      return [];
    }
    return (data || []).map(toCamelCase);
  },

  getAllUserHolidays: async (): Promise<(UserHoliday & { userName?: string })[]> => {
    // Fetch all holidays directly. Removing join with users to ensure absolute reliability.
    // Mapping name from the users list already fetched in the dashboard if needed.
    const { data, error } = await supabase
      .from('user_holidays')
      .select('*');
    
    if (error) {
      console.warn("Error fetching all user holidays:", error);
      return [];
    }

    return (data || []).map(toCamelCase);
  },

  saveUserHolidays: async (userId: string, holidays: { holidayName: string; holidayDate: string; year: number }[]): Promise<void> => {
    // Delete existing for the same year
    const year = holidays[0]?.year || new Date().getFullYear();
    await supabase.from('user_holidays').delete().eq('user_id', userId).eq('year', year);
    
    // Insert new ones
    if (holidays.length > 0) {
      const { error } = await supabase.from('user_holidays').insert(
        holidays.map(h => ({
          user_id: userId,
          holiday_name: h.holidayName,
          holiday_date: h.holidayDate,
          year: h.year
        }))
      );
      if (error) throw error;
    }
  },

  getUserById: async (id: string): Promise<User | null> => {
    const { data, error } = await supabase
      .from('users')
      .select('*, role_id')
      .eq('id', id)
      .single();
    if (error) return null;
    return toCamelCase({ ...data, role: data.role_id });
  },
  getUsersWithManagers: async (): Promise<(User & { managerName?: string })[]> => {
    const { data: users, error } = await supabase.from('users').select('*, reporting_manager_id, role_id');
    if (error) throw error;
    const camelUsers = (users || []).map(u => ({
      ...toCamelCase({ ...u, role: u.role_id }),
      reportingManagerId: u.reporting_manager_id
    }));
    const userMap = new Map(camelUsers.map(u => [u.id, u.name]));
    return camelUsers.map(u => ({
      ...u,
      managerName: u.reportingManagerId ? userMap.get(u.reportingManagerId) : undefined
    }));
  },
  getTeamMembers: async (managerId: string): Promise<User[]> => {
    const { data, error } = await supabase
      .from('users')
      .select('*, role_id')
      .eq('reporting_manager_id', managerId);
    if (error) throw error;
    return (data || []).map(u => toCamelCase({ ...u, role: u.role_id }));
  },
  getLatestLocations: async (userIds: string[]): Promise<Record<string, { latitude: number; longitude: number; timestamp: string }>> => {
    if (userIds.length === 0) return {};
    
    // Fetch latest location for each user in parallel for better performance
    // than fetching all historical records and filtering in JS.
    const results = await Promise.all(
      userIds.map(id => 
        supabase
          .from('attendance_events')
          .select('user_id, latitude, longitude, timestamp')
          .eq('user_id', id)
          .not('latitude', 'is', null)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle()
      )
    );

    const latest: Record<string, any> = {};
    results.forEach(({ data }) => {
      if (data) {
        latest[data.user_id] = toCamelCase(data);
      }
    });
    return latest;
  },
  getLocationHistory: async (userId: string, startTs: string, endTs: string): Promise<AttendanceEvent[]> => {
    return api.getAttendanceEvents(userId, startTs, endTs);
  },
  getFieldStaff: async () => api.getUsers().then(users => users.filter((u: any) => u.role === 'field_staff')),

  getTeamLocations: async (userIds: string[]): Promise<Record<string, { state: string; city: string }>> => {
    if (userIds.length === 0) return {};

    const normalize = (str: any) => {
      if (!str || typeof str !== 'string') return '';
      const trimmed = str.trim();
      if (!trimmed) return '';
      // Remove common suffixes like "State", "City", "Union Territory"
      let cleaned = trimmed.replace(/,\s*$/, '').replace(/\s+(State|Union\s+Territory|City)$/i, '');
      const n = cleaned.toLowerCase().split(/\s+/).map(word => 
        word.charAt(0).toUpperCase() + word.slice(1)
      ).join(' ');
      return CITY_NAME_MAP[n] || n;
    };

    const inferState = (city: string, text: string) => {
      const normalizedCity = normalize(city);
      if (normalizedCity && CITY_TO_STATE_MAP[normalizedCity]) return CITY_TO_STATE_MAP[normalizedCity];
      
      const lowerText = (text || '').toLowerCase();
      // 1. Scan for primary city names in text
      for (const [c, s] of Object.entries(CITY_TO_STATE_MAP)) {
        if (lowerText.includes(c.toLowerCase())) return s;
      }
      
      // 2. Scan for city aliases in text
      for (const [alt, norm] of Object.entries(CITY_NAME_MAP)) {
        if (lowerText.includes(alt.toLowerCase()) && CITY_TO_STATE_MAP[norm]) {
          return CITY_TO_STATE_MAP[norm];
        }
      }
      
      // 3. Scan for explicit state names in text
      for (const s of INDIAN_STATES) {
        if (lowerText.includes(s.toLowerCase())) return s;
      }
      return null;
    };

    const inferCity = (text: string) => {
      const lowerText = (text || '').toLowerCase();
      // Match primary city names first
      for (const c of Object.keys(CITY_TO_STATE_MAP)) {
        if (lowerText.includes(c.toLowerCase())) return c;
      }
      // Match city aliases
      for (const [alt, norm] of Object.entries(CITY_NAME_MAP)) {
        if (lowerText.includes(alt.toLowerCase())) return norm;
      }
      return null;
    };

    // 1. Fetch data in parallel
    const [subResults, userResults, orgResults] = await Promise.all([
      supabase.from('onboarding_submissions').select('user_id, address').in('user_id', userIds).not('address', 'is', null),
      supabase.from('users').select('id, organization_id, organization_name').in('id', userIds),
      supabase.from('organizations').select('id, address')
    ]);

    const locations: Record<string, { state: string; city: string }> = {};
    const orgMap = new Map((orgResults.data || []).map(o => [o.id, o.address]));
    const userToOrg = new Map((userResults.data || []).map(u => [u.id, u.organization_id]));
    const userToOrgName = new Map((userResults.data || []).map(u => [u.id, u.organization_name]));

    // 2. Fallback: Use Organization/Site address for users
    userIds.forEach(uid => {
      const orgId = userToOrg.get(uid);
      const orgName = userToOrgName.get(uid);
      const orgAddr = orgId ? orgMap.get(orgId) : null;
      
      const combinedText = `${orgName || ''} ${orgAddr || ''}`;
      if (combinedText.trim()) {
        const state = inferState('', combinedText);
        let city = inferCity(combinedText);
        
        if (state) {
          locations[uid] = { state, city: city || 'Other' };
        }
      }
    });

    // 3. Primary: Use Onboarding Submission address (Overwrite with more specific data)
    (subResults.data || []).forEach(sub => {
      const addr = sub.address as any;
      // Handle various address formats (nested vs flat)
      const stateRaw = addr?.present?.state || addr?.permanent?.state || addr?.state;
      const cityRaw = addr?.present?.city || addr?.permanent?.city || addr?.city;
      
      let state = normalize(normalizeStateName(stateRaw));
      let city = normalize(cityRaw);

      if (!state && city) {
        state = inferState(city, '');
      } else if (!state && !city && typeof addr === 'string') {
        // Handle case where address might be a raw string
        state = inferState('', addr);
        city = inferCity(addr);
      }

      if (state && sub.user_id) {
        locations[sub.user_id] = { 
          state, 
          city: city || 'Other'
        };
      }
    });

    return locations;
  },
  /**
   * Fetch users who should receive check‑in/out notifications.
   * Includes HR, operations managers, admins, developers and site managers.
   * This allows the app to notify the appropriate stakeholders when a
   * field staff checks in or out.
   */
  getNearbyUsers: async () => {
    const allUsers = await api.getUsers();
    // Determine availability based on today's attendance events.  We fetch
    // all events from the beginning of the current day until now and then
    // look at the most recent event per user.  If the latest event is a
    // check‑in (type === 'check in' or 'check-in'), the user is marked
    // available; otherwise, unavailable.  Errors while fetching events
    // will be silently ignored and all users will default to available.
    let availability: Record<string, boolean> = {};
    try {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const end = new Date();
      const events = await api.getAllAttendanceEvents(start.toISOString(), end.toISOString());
      const latest: Record<string, { type: string; timestamp: string }> = {};
      events.forEach(evt => {
        const { userId, type, timestamp } = evt as any;
        if (!userId) return;
        if (!latest[userId] || new Date(timestamp) > new Date(latest[userId].timestamp)) {
          latest[userId] = { type: type.toLowerCase(), timestamp };
        }
      });
      availability = Object.fromEntries(Object.entries(latest).map(([userId, info]) => {
        // Normalize the type string: remove underscores, hyphens, convert to lowercase
        const normalizedType = info.type.toLowerCase().replace(/[-_\s]/g, '');
        // User is available only if their latest event is check-in
        const isCheckIn = normalizedType === 'checkin';
        console.log(`User ${userId}: latest event type = "${info.type}", normalized = "${normalizedType}", isCheckIn = ${isCheckIn}`);
        return [userId, isCheckIn];
      }));
    } catch (e) {
      console.warn('Failed to compute user availability:', e);
    }
    return allUsers
      .map(u => ({ ...u, isAvailable: availability[u.id] ?? false }));
  },

  updateUser: async (id: string, updates: Partial<User>) => {
    const { role, biometricId, organizationId, organizationName, ...rest } = updates;
    const dbUpdates: any = toSnakeCase(rest);
    if (role) dbUpdates.role_id = role;
    if (biometricId !== undefined) dbUpdates.biometric_id = biometricId;
    if (organizationId !== undefined) dbUpdates.organization_id = organizationId;
    if (organizationName !== undefined) dbUpdates.organization_name = organizationName;

    if ('photo_url' in dbUpdates) {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) throw new Error("User not authenticated for photo upload");
      const userId = session.user.id;

      const { data: currentUserData } = await supabase.from('users').select('photo_url').eq('id', id).single();
      const oldPhotoUrl = currentUserData?.photo_url;

      const deleteOldAvatar = async (oldUrl: string | null | undefined) => {
        if (!oldUrl) return;
        try {
          const urlObject = new URL(oldUrl);
          const pathWithBucket = urlObject.pathname.split('/public/')[1];
          if (pathWithBucket) {
            const [bucketName, ...pathParts] = pathWithBucket.split('/');
            const oldPath = pathParts.join('/');
            if (oldPath) await supabase.storage.from(bucketName).remove([oldPath]);
          }
        } catch (e) {
          console.error("Failed to process old avatar URL for deletion:", e);
        }
      };

      if (dbUpdates.photo_url && dbUpdates.photo_url.startsWith('data:')) {
        await deleteOldAvatar(oldPhotoUrl);
        const blob = await dataUrlToBlob(dbUpdates.photo_url);
        const fileExt = dbUpdates.photo_url.split(';')[0].split('/')[1] || 'jpg';
        const filePath = `${userId}/${Date.now()}.${fileExt}`;
        // Allow overwriting existing files if the same filename is used by enabling the `upsert` option.
        // Without `upsert: true`, Supabase will reject uploads with duplicate paths.
        const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(filePath, blob, { upsert: true });
        if (uploadError) throw uploadError;
        const { data: { publicUrl } } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
        dbUpdates.photo_url = publicUrl;
      } else if (dbUpdates.photo_url === null) {
        await deleteOldAvatar(oldPhotoUrl);
      }
    }

    const { data, error } = await supabase.from('users').update(dbUpdates).eq('id', id).select().single();
    if (error) throw error;
    return toCamelCase({ ...data, role: data.role_id });
  },

  createUser: async (userData: Partial<User>): Promise<User> => {
    const { role, ...rest } = userData;
    const dbData: any = toSnakeCase(rest);
    if (role) dbData.role_id = role;

    const { data, error } = await supabase.from('users').insert(dbData).select().single();
    if (error) throw error;
    return toCamelCase({ ...data, role: data.role_id });
  },

  deleteUser: async (id: string) => {
    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) throw error;
  },

  updateUserReportingManager: async (userId: string, managerId: string | null) => {
    const { error } = await supabase.from('users').update({ reporting_manager_id: managerId }).eq('id', userId);
    if (error) throw error;
  },

  getOrganizations: async (filter?: { page?: number, pageSize?: number }): Promise<any> => {
    let query = supabase.from('organizations').select('*', { count: 'exact' });
    
    const isPaginated = filter?.page !== undefined && filter?.pageSize !== undefined;
    if (isPaginated) {
      const from = (filter!.page! - 1) * filter!.pageSize!;
      const to = from + filter!.pageSize! - 1;
      query = query.range(from, to);
    }
    
    const { data, count, error } = await query.order('short_name');
    if (error) throw error;
    
    const formattedData = (data || []).map(toCamelCase);
    if (isPaginated) {
      return { data: formattedData, total: count || 0 };
    }
    return formattedData;
  },
  createOrganization: async (org: Organization): Promise<Organization> => {
    const { data, error } = await supabase.from('organizations').insert(toSnakeCase(org)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  getOrganizationStructure: async (): Promise<OrganizationGroup[]> => {
    const { data: groups, error: groupsError } = await supabase.from('organization_groups').select('*');
    if (groupsError) throw groupsError;
    const { data: companies, error: companiesError } = await supabase.from('companies').select('*');
    if (companiesError) throw companiesError;
    const { data: entities, error: entitiesError } = await supabase.from('entities').select('*');
    if (entitiesError) throw entitiesError;

    const camelGroups: any[] = (groups || []).map(toCamelCase);
    const camelCompanies: any[] = (companies || []).map(toCamelCase);
    const camelEntities: any[] = (entities || []).map(toCamelCase);

    const companyMap = new Map<string, any[]>();
    camelCompanies.forEach(company => {
      const companyWithEntities = { ...company, entities: camelEntities.filter(e => e.companyId === company.id) };
      if (!companyMap.has(company.groupId)) companyMap.set(company.groupId, []);
      companyMap.get(company.groupId)!.push(companyWithEntities);
    });

    return camelGroups.map(group => ({ ...group, companies: companyMap.get(group.id) || [], locations: [] }));
  },
  bulkSaveOrganizationStructure: async (groups: OrganizationGroup[]): Promise<void> => {
    // 1. Upsert Groups (exclude companies and locations)
    const groupData = groups.map(({ companies, locations, ...rest }) => toSnakeCase(rest));
    const { error: groupError } = await supabase.from('organization_groups').upsert(groupData);
    if (groupError) throw groupError;

    // 2. Upsert Companies (exclude entities)
    const companies = groups.flatMap(g => g.companies.map(c => ({ ...c, groupId: g.id })));
    const companyData = companies.map(({ entities, ...rest }) => toSnakeCase(rest));
    const { error: companyError } = await supabase.from('companies').upsert(companyData);
    if (companyError) throw companyError;

    // 3. Upsert Entities (Clients)
    const entities = companies.flatMap(c => c.entities.map(e => ({ ...e, companyId: c.id })));
    const entityData = entities.map(e => toSnakeCase(e));
    const { error: entityError } = await supabase.from('entities').upsert(entityData);
    if (entityError) throw entityError;

    // 4. Ensure matching entries in 'organizations' table for onboarding metadata
    // We only need to create them if they don't exist yet. This prevents errors in SelectOrganization.tsx.
    const orgData = entities.map(e => ({
        id: e.organizationId || e.id,
        short_name: e.name,
        full_name: e.name,
        address: e.registeredAddress || '',
        updated_at: new Date().toISOString()
    }));

    // Perform a bulk upsert on organizations. 
    // This will create new records or update existing basic info without overwriting manually managed manpower limits.
    const { error: orgError } = await supabase.from('organizations').upsert(orgData, { onConflict: 'id' });
    if (orgError) throw orgError;
  },
  createOrganizationGroup: async (group: Partial<OrganizationGroup>): Promise<OrganizationGroup> => {
    const { data, error } = await supabase.from('organization_groups').insert(toSnakeCase(group)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  updateOrganizationGroup: async (id: string, updates: Partial<OrganizationGroup>): Promise<OrganizationGroup> => {
    const { data, error } = await supabase.from('organization_groups').update(toSnakeCase(updates)).eq('id', id).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  deleteOrganizationGroup: async (id: string): Promise<void> => {
    const { error } = await supabase.from('organization_groups').delete().eq('id', id);
    if (error) throw error;
  },
  createCompany: async (company: Partial<Company>): Promise<Company> => {
    const { entities, ...rest } = company;
    const { data, error } = await supabase.from('companies').insert(toSnakeCase(rest)).select().single();
    if (error) throw error;
    return toCamelCase({ ...data, entities: [] });
  },
  updateCompany: async (id: string, updates: Partial<Company>): Promise<Company> => {
    const { entities, ...rest } = updates;
    const { data, error } = await supabase.from('companies').update(toSnakeCase(rest)).eq('id', id).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  deleteCompany: async (id: string): Promise<void> => {
    const { error } = await supabase.from('companies').delete().eq('id', id);
    if (error) throw error;
  },
  saveEntity: async (entity: Partial<Entity>): Promise<Entity> => {
    const { id, ...rest } = entity;
    const dbData = toSnakeCase(rest);
    let query;
    if (id && !id.startsWith('new_')) {
      query = supabase.from('entities').update(dbData).eq('id', id);
    } else {
      query = supabase.from('entities').insert({ ...dbData, id: id?.startsWith('new_') ? `ent_${Date.now()}` : id });
    }
    const { data, error } = await query.select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  deleteEntity: async (id: string): Promise<void> => {
    const { error } = await supabase.from('entities').delete().eq('id', id);
    if (error) throw error;
  },
  saveSiteConfiguration: async (organizationId: string, config: SiteConfiguration): Promise<void> => {
    const { data, error } = await supabase.from('site_configurations').upsert({
      organization_id: organizationId,
      config_data: config
    }, { onConflict: 'organization_id' });
    if (error) throw error;
  },
  getSiteConfigurations: async (): Promise<SiteConfiguration[]> => {
    const { data, error } = await supabase.from('site_configurations').select('*');
    if (error) throw error;
    return (data || []).map(row => ({
      ...toCamelCase(row.config_data),
      organizationId: row.organization_id
    }));
  },
  bulkUploadOrganizations: async (orgs: Organization[]): Promise<{ count: number }> => {
    const { count, error } = await supabase.from('organizations').upsert(toSnakeCase(orgs), { onConflict: 'id' });
    if (error) throw error;
    return { count: count || 0 };
  },
  getModules: async (): Promise<AppModule[]> => {
    const { data, error } = await supabase.from('app_modules').select('*');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  saveModules: async (modules: AppModule[]): Promise<void> => {
    // A full replacement is complex, upsert is simplest for now.
    const { error } = await supabase.from('app_modules').upsert(toSnakeCase(modules));
    if (error) throw error;
  },
  getRoles: async (): Promise<Role[]> => {
    const { data, error } = await supabase.from('roles').select('*');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  saveRoles: async (roles: Role[]): Promise<void> => {
    const { error } = await supabase.from('roles').upsert(toSnakeCase(roles));
    if (error) throw error;
  },
  getHolidays: async (): Promise<Holiday[]> => {
    const { data, error } = await supabase.from('holidays').select('*');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  addHoliday: async (holiday: Omit<Holiday, 'id'>): Promise<Holiday> => {
    const { data, error } = await supabase.from('holidays').insert(toSnakeCase(holiday)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  removeHoliday: async (id: string): Promise<void> => {
    const { error } = await supabase.from('holidays').delete().eq('id', id);
    if (error) throw error;
  },
  getAttendanceEvents: async (userId: string, start: string, end: string): Promise<AttendanceEvent[]> => {
    const query = supabase.from('attendance_events')
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', start)
      .lte('timestamp', end)
      .order('timestamp', { ascending: true });
    
    const data = await fetchAll<any>(query);
    return (data || []).map(toCamelCase);
  },
  getAllAttendanceEvents: async (start: string, end: string): Promise<AttendanceEvent[]> => {
    const query = supabase.from('attendance_events')
      .select('*')
      .gte('timestamp', start)
      .lte('timestamp', end)
      .order('timestamp', { ascending: true });

    const data = await fetchAll<any>(query);
    return (data || []).map(toCamelCase);
  },
  getAttendanceDashboardData: async (startDate: Date, endDate: Date, currentDate: Date, timezone: string = 'UTC') => {
    const { data, error } = await supabase.rpc('get_attendance_dashboard_data', {
      start_date_iso: format(startDate, 'yyyy-MM-dd'),
      end_date_iso: format(endDate, 'yyyy-MM-dd'),
      current_date_iso: format(currentDate, 'yyyy-MM-dd'),
      p_timezone: timezone,
    });
    if (error) throw new Error('Could not load attendance dashboard data from the database function.');
    return data;
  },
  /**
   * Insert an attendance event.  The event may optionally include a
   * `locationId` if the user checked in/out within a geofenced location.
   * The caller should send latitude/longitude regardless of whether a
   * location was detected; this preserves the original coordinates for
   * auditing and reverse geocoding.
   *
   * @param event An attendance event without an id.  Accepts optional
   *              latitude, longitude, locationId, and locationName properties.
   */
  addAttendanceEvent: async (event: Omit<AttendanceEvent, 'id'>): Promise<void> => {
    const { error } = await supabase
      .from('attendance_events')
      .insert(toSnakeCase(event));
    if (error) throw error;
  },

  /**
   * Retrieve all defined user roles from the system.
   */
  getAppRoles: async (): Promise<Role[]> => {
    const { data, error } = await supabase
      .from('roles')
      .select('id, display_name');
    if (error) throw error;
    return (data || []).map(r => ({
      id: r.id,
      displayName: r.display_name
    }));
  },

  /**
   * Manually trigger missed check-outs for configured staff.
   * Identifies users with selected roles/groups who checked in today but have no check-out.
   * Records a check-out at 19:00 (7 PM), logs it, and notifies appropriate users.
   */
  async triggerMissedCheckouts(settings?: AttendanceSettings): Promise<{ count: number }> {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('trigger-missed-checkouts', {
      body: { 
        manual: true,
        settings: settings ? toSnakeCase(settings) : undefined
      },
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`
      }
    });

    if (error) {
      console.error('Edge Function Error:', error);
      throw error;
    }

    // The function returns a report. We sum the usersProcessed across all groups for the UI count.
    let totalProcessed = 0;
    if (data?.groups) {
      Object.values(data.groups).forEach((g: any) => {
        if (g.usersProcessed) totalProcessed += g.usersProcessed;
      });
    }

    return { count: totalProcessed };
  },

  /**
   * Retrieve all geofenced locations.  Returns an array of Location
   * objects with camelCased keys.
   */
  /**
   * Retrieve all defined geofenced locations.  In addition to the base
   * fields stored on the locations table, this query joins the
   * `users` table to fetch the name of the user that created the
   * location.  The resulting records include a `createdByName` field
   * which will be undefined if no creator is stored or the creator
   * record is not found.  This helper returns camel‑cased keys.
   */
  getLocations: async (): Promise<Location[]> => {
    // Join the locations table to the users table via the created_by
    // foreign key.  Alias the joined user as created_by_user so the
    // resulting object includes nested fields under that key.  We
    // explicitly select all location columns, then the name of the
    // creator.  Supabase will return an array of objects with a
    // created_by_user property containing the joined user row.
    const { data, error } = await supabase
      .from('locations')
      .select('*, created_by_user:created_by (id, name)');
    if (error) throw error;
    // Convert to camelCase and hoist the creator name into
    // createdByName for convenience.  Preserve other fields as is.
    return (data || []).map((raw: any) => {
      const camel = toCamelCase(raw) as any;
      const createdByUser = camel.createdByUser as { id?: string; name?: string } | undefined;
      const createdByName = createdByUser?.name || undefined;
      // Remove the nested createdByUser field to avoid leaking
      // implementation details.  Spread the camel object first to
      // preserve all other properties.
      const { createdByUser: _omit, ...rest } = camel;
      return { ...rest, createdByName } as Location;
    });
  },

  /**
   * Retrieve locations assigned to a user.  This joins user_locations
   * and locations to return full Location records.  Only assignments
   * where user_id matches are returned (enforced by RLS).  Admins can
   * override by specifying a different userId.
   */
  getUserLocations: async (userId: string): Promise<Location[]> => {
    const { data, error } = await supabase
      .from('user_locations')
      .select('location_id:location_id (*), id')
      .eq('user_id', userId);
    if (error) throw error;
    // Flatten nested location record from join: { location_id: { ... } }
    return (data || []).map((row: any) => {
      const loc = row.location_id || {};
      return toCamelCase(loc);
    }) as Location[];
  },

  /**
   * Create a new geofenced location.  Returns the inserted Location
   * record.  The caller must provide name, latitude, longitude and
   * radius.  createdBy is optional and will be stored if provided.
   */
  createLocation: async (loc: {
    name?: string | null;
    latitude: number;
    longitude: number;
    radius: number;
    /** Optional pre‑computed address for this location */
    address?: string | null;
    createdBy?: string | null;
  }): Promise<Location> => {
    // Convert camelCased keys to snake_cased for Supabase
    const payload = toSnakeCase(loc);
    const { data, error } = await supabase
      .from('locations')
      .insert(payload)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? toCamelCase(data) as Location : null as any;
  },

  /**
   * Assign an existing location to a user.  This creates a row in
   * user_locations.  Only the id of the new assignment is returned.
   */
  assignLocationToUser: async (userId: string, locationId: string): Promise<void> => {
    const { error } = await supabase
      .from('user_locations')
      .insert({ user_id: userId, location_id: locationId });
    if (error) throw error;
  },

  /**
   * Update an existing location by ID.  Accepts a partial set of
   * fields (name, latitude, longitude, radius, address).  Returns the
   * updated Location record.
   */
  updateLocation: async (id: string, updates: {
    name?: string | null;
    latitude?: number;
    longitude?: number;
    radius?: number;
    address?: string | null;
  }): Promise<Location> => {
    const payload = toSnakeCase(updates);
    const { data, error } = await supabase
      .from('locations')
      .update(payload)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return data ? toCamelCase(data) as Location : null as any;
  },

  /**
   * Delete a location by ID.  Cascading deletes remove any
   * user_locations referencing this location.  Returns void.
   */
  deleteLocation: async (id: string): Promise<void> => {
    const { error } = await supabase
      .from('locations')
      .delete()
      .eq('id', id);
    if (error) throw error;
  },

  /**
   * Remove a user->location assignment.  Deletes the row from
   * user_locations for the given userId and locationId.
   */
  unassignLocationFromUser: async (userId: string, locationId: string): Promise<void> => {
    const { error } = await supabase
      .from('user_locations')
      .delete()
      .match({ user_id: userId, location_id: locationId });
    if (error) throw error;
  },

  /**
   * Upload a company logo to the dedicated `logo` bucket.  Returns the
   * public URL of the uploaded image.  The caller should persist
   * this URL in the application settings so it can be used as the
   * active or default logo.  A unique filename is generated to avoid
   * overwriting existing objects.
   */
  uploadLogo: async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${fileName}`;
    const { error: uploadError } = await supabase.storage.from(LOGO_BUCKET).upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  },

  /**
   * Fetch all logos stored in the `logo` bucket.  Returns an array of
   * objects with `name` and `url` for each file.  This is useful for
   * listing available logos in the interface settings modal.
   */
  getLogos: async (): Promise<{ name: string; url: string }[]> => {
    const { data, error } = await supabase.storage.from(LOGO_BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    return (data || []).map(obj => {
      const { data: { publicUrl } } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(obj.name);
      return { name: obj.name, url: publicUrl };
    });
  },

  /**
   * Delete a logo from the `logo` bucket by its filename.  Returns void
   * on success.  The caller should remove any references to this logo
   * in settings.  If the file does not exist, this call is a no-op.
   */
  deleteLogo: async (fileName: string): Promise<void> => {
    const { error } = await supabase.storage.from(LOGO_BUCKET).remove([fileName]);
    if (error) throw error;
  },

  /**
   * Upload a background image to the `background` bucket for use in the
   * login carousel.  Returns the public URL of the uploaded image.
   */
  uploadBackground: async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop() || 'png';
    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${fileName}`;
    const { error: uploadError } = await supabase.storage.from(BACKGROUND_BUCKET).upload(filePath, file, { upsert: true });
    if (uploadError) throw uploadError;
    const { data: { publicUrl } } = supabase.storage.from(BACKGROUND_BUCKET).getPublicUrl(filePath);
    return publicUrl;
  },

  /**
   * Fetch all background images from the `background` bucket.  Returns
   * an array of objects with `name` and `url` for each file.
   */
  getBackgroundImages: async (): Promise<{ name: string; url: string }[]> => {
    const { data, error } = await supabase.storage.from(BACKGROUND_BUCKET).list('', { limit: 100, sortBy: { column: 'name', order: 'asc' } });
    if (error) throw error;
    return (data || []).map(obj => {
      const { data: { publicUrl } } = supabase.storage.from(BACKGROUND_BUCKET).getPublicUrl(obj.name);
      return { name: obj.name, url: publicUrl };
    });
  },

  /**
   * Delete a background image by filename from the `background` bucket.
   */
  deleteBackground: async (fileName: string): Promise<void> => {
    const { error } = await supabase.storage.from(BACKGROUND_BUCKET).remove([fileName]);
    if (error) throw error;
  },
  getAttendanceSettings: async (): Promise<AttendanceSettings> => {
    const { data, error } = await supabase.from('settings').select('attendance_settings').eq('id', 'singleton').single();
    if (error) throw error;
    if (!data?.attendance_settings) throw new Error('Attendance settings are not configured.');
    return toCamelCase(data.attendance_settings) as AttendanceSettings;
  },
  saveAttendanceSettings: async (settings: AttendanceSettings): Promise<void> => {
    // Ensure we are upserting with the correct ID and data structure
    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          id: 'singleton',
          attendance_settings: toSnakeCase(settings)
        },
        { onConflict: 'id' }
      );

    if (error) {
      console.error("Error saving attendance settings:", error);
      throw error;
    }
  },
  saveApiSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          id: 'singleton',
          api_settings: toSnakeCase(settings)
        },
        { onConflict: 'id' }
      );
    if (error) {
      console.error("Error saving API settings:", error);
      throw error;
    }
  },
  saveAddressSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert(
        {
          id: 'singleton',
          address_settings: toSnakeCase(settings)
        },
        { onConflict: 'id' }
      );
    if (error) {
      console.error("Error saving address settings:", error);
      throw error;
    }
  },
  saveGeminiApiSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'singleton', gemini_api_settings: toSnakeCase(settings) }, { onConflict: 'id' });
    if (error) throw error;
  },
  saveOfflineOcrSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'singleton', offline_ocr_settings: toSnakeCase(settings) }, { onConflict: 'id' });
    if (error) throw error;
  },
  savePerfiosApiSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'singleton', perfios_api_settings: toSnakeCase(settings) }, { onConflict: 'id' });
    if (error) throw error;
  },
  saveOtpSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'singleton', otp_settings: toSnakeCase(settings) }, { onConflict: 'id' });
    if (error) throw error;
  },
  saveSiteManagementSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'singleton', site_management_settings: toSnakeCase(settings) }, { onConflict: 'id' });
    if (error) throw error;
  },
  saveNotificationSettings: async (settings: any): Promise<void> => {
    const { error } = await supabase
      .from('settings')
      .upsert({ id: 'singleton', notification_settings: toSnakeCase(settings) }, { onConflict: 'id' });
    if (error) throw error;
  },

  getRecurringHolidays: async (): Promise<RecurringHolidayRule[]> => {
    const { data, error } = await supabase.from('recurring_holidays').select('*');
    if (error) throw error;
    return (data || []).map(row => ({
      id: row.id,
      type: row.role_type,
      day: row.day,
      n: row.occurrence
    }));
  },

  addRecurringHoliday: async (rule: RecurringHolidayRule): Promise<RecurringHolidayRule> => {
    const dbRule = {
      role_type: rule.type || 'office',
      day: rule.day,
      occurrence: rule.n
    };
    const { data, error } = await supabase.from('recurring_holidays').insert(dbRule).select().single();
    if (error) throw error;
    return {
      id: data.id,
      type: data.role_type,
      day: data.day,
      n: data.occurrence
    };
  },

  deleteRecurringHoliday: async (id: string): Promise<void> => {
    const { error } = await supabase.from('recurring_holidays').delete().eq('id', id);
    if (error) throw error;
  },
  createAssignment: async (officerId: string, siteId: string, date: string): Promise<void> => {
    // 1. Create a task for the officer
    const site = (await api.getOrganizations()).find(o => o.id === siteId);
    await api.createTask({
      name: `Visit ${site?.shortName || 'site'} for verification`,
      description: `Perform on-site duties and verification tasks for ${site?.shortName}.`,
      dueDate: date,
      priority: 'Medium',
      assignedToId: officerId,
    });

    // 2. Persist the assignment state
    const { error } = await supabase.from('site_assignments').insert({
      officer_id: officerId,
      site_id: siteId,
      assignment_date: date
    });
    if (error && error.code !== '23505') throw error; // Ignore duplicates
  },
  getLeaveBalancesForUser: async (userId: string, asOfDate?: string): Promise<LeaveBalance> => {
    const getStaffType = (role: string): 'office' | 'field' | 'site' => {
      const r = (role || '').toLowerCase();
      // Office Roles
      if ([
        'hr', 'admin', 'finance', 'developer', 'management', 'office_staff', 
        'back_office_staff', 'bd', 'operation_manager', 'field_staff',
        'finance_manager', 'hr_ops', 'business developer', 'unverified',
        'operation manager', 'field staff', 'finance manager', 'hr ops'
      ].includes(r)) return 'office';
      
      // Site Roles
      if (['site_manager', 'site_supervisor', 'site manager', 'site supervisor'].includes(r)) return 'site';
      
      // Default to field (includes 'field_staff', 'field staff', etc.)
      return 'field';
    };
    const [
      { data: settingsData, error: settingsError },
      { data: userData, error: userError }
    ] = await Promise.all([
      supabase.from('settings').select('attendance_settings').eq('id', 'singleton').single(),
      supabase.from('users')
        .select(`
          role_id, 
          role:roles(display_name),
          earned_leave_opening_balance, 
          earned_leave_opening_date, 
          sick_leave_opening_balance, 
          sick_leave_opening_date
        `)
        .eq('id', userId)
        .single()
    ]);

    if (settingsError || !settingsData?.attendance_settings) throw new Error('Could not load attendance rules.');
    if (userError) throw userError;

    // Get role name from join or fallback to role_id string
    const roleData = userData.role;
    const roleName = (Array.isArray(roleData) ? roleData[0]?.display_name : (roleData as any)?.display_name) || userData.role_id;
    const staffType = getStaffType(roleName);
    const rules = (toCamelCase(settingsData.attendance_settings) as AttendanceSettings)[staffType];

    const referenceDate = asOfDate ? new Date(asOfDate.replace(/-/g, '/')) : new Date();
    const currentYear = referenceDate.getFullYear();
    const yearStart = `${currentYear}-01-01`;
    const todayStr = format(referenceDate, 'yyyy-MM-dd');

    const [
      { data: approvedLeaves, error: leavesError },
      { data: compOffData, error: compOffError },
      { data: otData, error: otError },
      { data: holidays, error: holidaysError },
      recurringHolidays,
      { data: yearEvents, error: eventsError }
    ] = await Promise.all([
      supabase.from('leave_requests')
        .select('leave_type, start_date, end_date, day_option')
        .eq('user_id', userId)
        .eq('status', 'approved')
        .gte('start_date', yearStart)
        .lte('start_date', `${currentYear}-12-31`),
      supabase.from('comp_off_logs').select('*').eq('user_id', userId),
      supabase.from('extra_work_logs').select('hours_worked').eq('user_id', userId).eq('claim_type', 'OT').eq('status', 'Approved').gte('work_date', format(startOfMonth(referenceDate), 'yyyy-MM-dd')).lte('work_date', format(endOfMonth(referenceDate), 'yyyy-MM-dd')),
      supabase.from('holidays').select('*'),
      api.getRecurringHolidays(),
      supabase.from('attendance_events')
        .select('timestamp')
        .eq('user_id', userId)
        .gte('timestamp', yearStart)
        .lte('timestamp', `${currentYear}-12-31`)
    ]);

    if (leavesError || compOffError || otError || holidaysError || eventsError) throw new Error("Failed to fetch all leave balance data.");

    // Expiry Check Logic Helper
    const isExpired = (expiryDate?: string) => expiryDate ? todayStr > expiryDate : false;

    // Calculate Earned Leave dynamically if rule exists
    let earnedTotal = rules.annualEarnedLeaves || 0;
    if (rules.earnedLeaveAccrual) {
      const openingBalance = userData.earned_leave_opening_balance || 0;
      const openingDate = userData.earned_leave_opening_date || format(new Date(), 'yyyy-MM-dd');
      
      const countableDays = await api.getCountableDays(userId, openingDate, format(new Date(), 'yyyy-MM-dd'), holidays || [], recurringHolidays || [], rules);
      earnedTotal = openingBalance + Math.floor(countableDays / rules.earnedLeaveAccrual.daysRequired) * rules.earnedLeaveAccrual.amountEarned;
    }

    // Calculate Floating Holidays based on attendance on Recurring Holidays (e.g. 3rd Saturday)
    // AND Comp Offs based on attendance on Sundays or Public Holidays
    const attendedDates = new Set((yearEvents || []).map(e => format(new Date(e.timestamp), 'yyyy-MM-dd')));
    const holidayDates = new Set(holidays.map(h => format(new Date(h.date), 'yyyy-MM-dd')));
    
    let floatingTotal = 0;
    let dynamicCompOffTotal = 0;
    
    attendedDates.forEach(dateStr => {
        const date = new Date(dateStr);
        const dayName = format(date, 'EEEE');
        
        // Floating Holiday Check
        const isFloatingRecurringHoliday = (recurringHolidays || []).some(rh => {
             if (rh.type && rh.type !== staffType) return false;
             if (rh.day !== dayName) return false;
             if (rh.n === 0) return true; 
             const dayOfMonth = date.getDate();
             const nth = Math.ceil(dayOfMonth / 7);
             return rh.n === nth;
        });
        if (isFloatingRecurringHoliday) floatingTotal++;

        // Comp Off Accrual Check (Sunday or Public Holiday)
        if (dayName === 'Sunday' || holidayDates.has(dateStr)) {
            dynamicCompOffTotal++;
        }
    });

    let sickTotal = 0;
    if (rules.enableSickLeaveAccrual) {
      const explicitOpeningDate = userData.sick_leave_opening_date;
      let openingBalance = 0;
      let startDateStr = yearStart;

      if (explicitOpeningDate) {
        const openingYear = new Date(explicitOpeningDate.replace(/-/g, '/')).getFullYear();
        if (openingYear === currentYear) {
          // PER REQUEST: Ignore opening balance on Jan 1st to prevent "carry forward" or default value artifacts.
          // Accrual should start fresh. Only allow opening balance for mid-year migrations.
          const isJanFirst = explicitOpeningDate.endsWith('-01-01');
          openingBalance = isJanFirst ? 0 : (userData.sick_leave_opening_balance || 0);
          startDateStr = explicitOpeningDate;
        }
      }
      
      const accrualStart = new Date(Math.max(new Date(startDateStr.replace(/-/g, '/')).getTime(), new Date(yearStart.replace(/-/g, '/')).getTime()));
      let current = startOfMonth(accrualStart);
      let accruedDays = 0;

      // Group attendance events by month
      const attendanceMonths = new Set((yearEvents || []).map(e => format(new Date(e.timestamp), 'yyyy-MM')));

      // Start from the accrual start and iterate until the end of the month being viewed
      const endBoundary = endOfMonth(referenceDate);
      
      while (current <= endBoundary) {
        const monthStr = format(current, 'yyyy-MM');
        if (attendanceMonths.has(monthStr)) {
          accruedDays += 1; // 1 day per month if present
        }
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
      }
      sickTotal = openingBalance + accruedDays;
    } else {
      sickTotal = rules.annualSickLeaves || 0;
    }

    const compOffTotal = (compOffData || []).filter(log => log.status === 'earned' || log.status === 'used').length + dynamicCompOffTotal;

    const expiryStates = {
      earned: isExpired(rules.earnedLeavesExpiryDate),
      sick: isExpired(rules.sickLeavesExpiryDate),
      floating: isExpired(rules.floatingLeavesExpiryDate),
      compOff: isExpired(rules.compOffLeavesExpiryDate)
    };

    const balance: LeaveBalance = {
      userId,
      earnedTotal,
      earnedUsed: 0,
      sickTotal,
      sickUsed: 0,
      floatingTotal,
      floatingUsed: 0,
      compOffTotal,
      compOffUsed: 0,
      otHoursThisMonth: (otData || []).reduce((sum, log) => sum + (log.hours_worked || 0), 0),
      expiryStates
    };

    (approvedLeaves || []).forEach(leave => {
      const leaveAmount = leave.day_option === 'half' ? 0.5 : differenceInCalendarDays(new Date(leave.end_date), new Date(leave.start_date)) + 1;
      const leaveStart = leave.start_date;
      
      if (leave.leave_type === 'Earned') {
        // Only count towards used if it was taken during validity, or if not expired
        if (!expiryStates.earned || (rules.earnedLeavesExpiryDate && leaveStart <= rules.earnedLeavesExpiryDate)) {
          balance.earnedUsed += leaveAmount;
        }
      }
      if (leave.leave_type === 'Sick') {
        if (!expiryStates.sick || (rules.sickLeavesExpiryDate && leaveStart <= rules.sickLeavesExpiryDate)) {
          balance.sickUsed += leaveAmount;
        }
      }
      if (leave.leave_type === 'Floating') {
        if (!expiryStates.floating || (rules.floatingLeavesExpiryDate && leaveStart <= rules.floatingLeavesExpiryDate)) {
          balance.floatingUsed += leaveAmount;
        }
      }
      if (leave.leave_type === 'Comp Off') {
        if (!expiryStates.compOff || (rules.compOffLeavesExpiryDate && leaveStart <= rules.compOffLeavesExpiryDate)) {
          balance.compOffUsed += leaveAmount;
        }
      }
    });

    // Capping Logic for expired leaves: if expired, available should be 0.
    // We achieve this by setting used = total if expired and used < total.
    // However, the dashboard calculation is (total - used).
    // Better to keep total and used honest but add logic in dashboard or here.
    // Let's keep it honest here and let the Dashboard handle visual "Expired" and capping.

    return balance;
  },

  getCountableDays: async (userId: string, fromDate: string, toDate: string, holidays: any[], recurringHolidays: any[], rules: StaffAttendanceRules): Promise<number> => {
    // 1. Fetch attendance events for the period
    const { data: events, error } = await supabase
      .from('attendance_events')
      .select('timestamp')
      .eq('user_id', userId)
      .gte('timestamp', startOfDay(new Date(fromDate)).toISOString())
      .lte('timestamp', endOfDay(new Date(toDate)).toISOString());
    
    if (error) throw error;

    const attendedDates = new Set((events || []).map(e => format(new Date(e.timestamp), 'yyyy-MM-dd')));
    const holidayDates = new Set(holidays.map(h => format(new Date(h.date), 'yyyy-MM-dd')));

    let countableCount = 0;
    const interval = { start: new Date(fromDate), end: new Date(toDate) };
    const days = eachDayOfInterval(interval);

    days.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      
      // Case 1: Employee worked (at least one attendance event)
      if (attendedDates.has(dateStr)) {
        countableCount++;
        return;
      }

      // Case 2: It's a public holiday
      if (holidayDates.has(dateStr)) {
        countableCount++;
        return;
      }

      // Case 3: It's a week-off day
      // a) Check weeklyOffDays rule (index-based)
      const dayOfWeek = getDay(day); // 0 = Sunday, 1 = Monday, ...
      if (rules.weeklyOffDays?.includes(dayOfWeek)) {
        countableCount++;
        return;
      }

      // b) Check recurring holidays (specifically role-based week-offs like "Every Sunday")
      const isRecurring = recurringHolidays.some(rh => {
        if (rh.day !== format(day, 'EEEE')) return false;
        if (rh.n === 0) return true; // 0 usually means every
        
        // Calculate which occurrence of that day it is in the month
        const dayOfMonth = day.getDate();
        const nth = Math.ceil(dayOfMonth / 7);
        return rh.n === nth;
      });

      if (isRecurring) {
        countableCount++;
        return;
      }
    });

    return countableCount;
  },
  submitLeaveRequest: async (data: Omit<LeaveRequest, 'id' | 'status' | 'currentApproverId' | 'approvalHistory'>): Promise<LeaveRequest> => {
    const { data: userProfile, error: userError } = await supabase.from('users').select('reporting_manager_id').eq('id', data.userId).single();
    if (userError) throw userError;
    
    // Process any attached files (like doctor's certificate)
    const dataWithPaths = await processFilesForUpload(data, data.userId, '');
    const dbData = toSnakeCase(dataWithPaths);
    
    // user_name is not a column in the leave_requests table
    delete dbData.user_name;

    const { data: insertedData, error: insertError } = await supabase.from('leave_requests').insert({ 
      ...dbData, 
      status: 'pending_manager_approval', 
      current_approver_id: userProfile.reporting_manager_id || null, 
      approval_history: [] 
    }).select('*').single();
    
    if (insertError) throw insertError;

    // Trigger notification to manager
    if (userProfile.reporting_manager_id) {
      try {
        // Dynamic Rule Dispatch
        dispatchNotificationFromRules('leave_request', {
          actorName: data.userName || 'An employee',
          actionText: `has submitted a new ${data.leaveType} leave request`,
          locString: '',
          actor: { 
            id: data.userId, 
            name: data.userName || 'Employee', 
            role: 'staff',
            reportingManagerId: userProfile.reporting_manager_id 
          }
        });

        await api.createNotification({
          userId: userProfile.reporting_manager_id,
          message: `${data.userName || 'An employee'} has submitted a new ${data.leaveType} leave request.`,
          type: 'info',
          linkTo: '/hr/leave-management'
        });
      } catch (notifError) {
        console.error('Failed to trigger leave notification:', notifError);
      }
    }

    return toCamelCase(insertedData);
  },
  updateLeaveRequest: async (id: string, updates: Partial<LeaveRequest>): Promise<LeaveRequest> => {
    const dbData = toSnakeCase(updates);
    delete dbData.user_name; // Ensure user_name is not sent

    const { data, error } = await supabase.from('leave_requests').update(dbData).eq('id', id).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  cancelLeaveRequest: async (id: string): Promise<void> => {
    const { error } = await supabase.from('leave_requests').delete().eq('id', id);
    if (error) throw error;
  },
  getLeaveRequests: async (filter?: { userId?: string, userIds?: string[], status?: string, forApproverId?: string, startDate?: string, endDate?: string, page?: number, pageSize?: number }): Promise<{ data: LeaveRequest[], total: number }> => {
    let query = supabase.from('leave_requests').select('*, users(name)', { count: 'exact' });
    if (filter?.userId) query = query.eq('user_id', filter.userId);
    if (filter?.userIds) query = query.in('user_id', filter.userIds);
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.forApproverId) query = query.eq('current_approver_id', filter.forApproverId);
    if (filter?.startDate && filter?.endDate) {
      query = query.lte('start_date', filter.endDate).gte('end_date', filter.startDate);
    }

    if (filter?.page && filter?.pageSize) {
      const from = (filter.page - 1) * filter.pageSize;
      const to = from + filter.pageSize - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query.order('start_date', { ascending: false });
    if (error) throw error;
    
    // Get unique approver IDs
    const approverIds = [...new Set((data || []).map(item => item.current_approver_id).filter(Boolean))];
    
    // Fetch approver names if there are any
    let approverMap: Record<string, string> = {};
    if (approverIds.length > 0) {
      const { data: approvers } = await supabase.from('users').select('id, name').in('id', approverIds);
      approverMap = (approvers || []).reduce((acc, user) => ({ ...acc, [user.id]: user.name }), {});
    }
    
    const formattedData = (data || []).map(item => {
      const camelItem = toCamelCase(item);
      const userObj = Array.isArray(item.users) ? item.users[0] : item.users;
      return {
        ...camelItem,
        userName: userObj?.name || 'Unknown',
        currentApproverName: item.current_approver_id ? (approverMap[item.current_approver_id] || null) : null
      };
    });

    return { data: formattedData, total: count || 0 };
  },
  getTasks: async (filter?: { page?: number, pageSize?: number }): Promise<any> => {
    let query = supabase.from('tasks').select('*', { count: 'exact' });
    
    const isPaginated = filter?.page !== undefined && filter?.pageSize !== undefined;
    if (isPaginated) {
      const from = (filter!.page! - 1) * filter!.pageSize!;
      const to = from + filter!.pageSize! - 1;
      query = query.range(from, to);
    }
    
    const { data, count, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    
    const formattedData = (data || []).map(toCamelCase);
    if (isPaginated) {
      return { data: formattedData, total: count || 0 };
    }
    return formattedData;
  },
  createTask: async (taskData: Partial<Task>): Promise<Task> => {
    const { data, error } = await supabase.from('tasks').insert(toSnakeCase({ ...taskData, status: 'To Do', escalationStatus: 'None' })).select().single();
    if (error) throw error;

    // Trigger rule-based notification
    if (data.assigned_to_id) {
        dispatchNotificationFromRules('task_assigned', {
            actorName: data.name,
            actionText: 'has been assigned',
            locString: '',
            actor: { id: data.created_by_id || '', name: 'System', role: 'admin' }
        });
    }

    return toCamelCase(data);
  },
  updateTask: async (id: string, updates: Partial<Task>): Promise<Task> => {
    // Handle completion photo upload
    if ((updates as any)?.completionPhoto && (updates as any).completionPhoto.file) {
      const completion: any = (updates as any).completionPhoto;
      const file: File = completion.file;
      try {
        const { path } = await api.uploadDocument(file, TASK_ATTACHMENTS_BUCKET);
        // Replace the completionPhoto with a JSON object containing metadata and the path
        (updates as any).completionPhoto = {
          name: completion.name,
          type: completion.type,
          size: completion.size,
          path,
        };
      } catch (uploadError) {
        console.error('Failed to upload task completion photo:', uploadError);
        // Remove the file property to avoid sending File object to database
        delete (updates as any).completionPhoto;
      }
    }
    const { data, error } = await supabase.from('tasks').update(toSnakeCase(updates)).eq('id', id).select().single();
    if (error) throw error;

    // Trigger notification if task is completed
    if (updates.status === 'Done') {
        dispatchNotificationFromRules('task_completed', {
            actorName: data.name,
            actionText: 'has been completed',
            locString: '',
            actor: { id: data.assigned_to_id || '', name: 'Staff', role: 'staff' }
        });
    }

    return toCamelCase(data);
  },
  deleteTask: async (id: string): Promise<void> => {
    const { error } = await supabase.from('tasks').delete().eq('id', id);
    if (error) throw error;
  },
  runAutomaticEscalations: async (): Promise<{ updatedTasks: Task[], newNotifications: Notification[] }> => {
    const { data, error } = await supabase.functions.invoke('run-escalations');
    if (error) throw error;
    return toCamelCase(data);
  },
  getNotifications: async (userId: string): Promise<Notification[]> => {
    const { data, error } = await supabase.from('notifications').select('*').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  createNotification: async (data: Omit<Notification, 'id' | 'createdAt' | 'isRead'>): Promise<Notification> => {
    const { data: inserted, error } = await supabase.from('notifications').insert(toSnakeCase(data)).select().single();
    if (error) throw error;
    return toCamelCase(inserted);
  },
  markNotificationAsRead: async (id: string): Promise<void> => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
  },
  markAllNotificationsAsRead: async (userId: string): Promise<void> => {
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false);
  },

  getNotificationRules: async (): Promise<NotificationRule[]> => {
    const { data, error } = await supabase.from('notification_rules').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return data.map(toCamelCase);
  },

  saveNotificationRule: async (rule: Partial<NotificationRule>): Promise<NotificationRule> => {
    const data = toSnakeCase(rule);
    if (rule.id) {
      const { data: updated, error } = await supabase.from('notification_rules').update(data).eq('id', rule.id).select().single();
      if (error) throw error;
      return toCamelCase(updated);
    } else {
      const { data: inserted, error } = await supabase.from('notification_rules').insert(data).select().single();
      if (error) throw error;
      return toCamelCase(inserted);
    }
  },

  deleteNotificationRule: async (id: string): Promise<void> => {
    const { error } = await supabase.from('notification_rules').delete().eq('id', id);
    if (error) throw error;
  },

  broadcastNotification: async (data: { role?: string; userIds?: string[]; message: string; title?: string; type?: NotificationType }): Promise<void> => {
    let finalUserIds: string[] = data.userIds || [];
    
    if (data.role) {
      const { data: users, error } = await supabase.from('users').select('id').eq('role', data.role);
      if (error) throw error;
      finalUserIds = [...new Set([...finalUserIds, ...users.map(u => u.id)])];
    }

    if (finalUserIds.length === 0 && !data.role) {
      // Broadcast to all if no role/userIds specified? Or maybe just error out. 
      // Let's assume broadcasting to all if nothing is provided.
      const { data: allUsers, error } = await supabase.from('users').select('id');
      if (error) throw error;
      finalUserIds = allUsers.map(u => u.id);
    }

    const notifications = finalUserIds.map(userId => toSnakeCase({
      userId,
      message: data.message,
      title: data.title || 'System Broadcast',
      type: data.type || 'info',
    }));

    const { error: insertError } = await supabase.from('notifications').insert(notifications);
    if (insertError) throw insertError;
  },

  // Field Reporting API
  getChecklistTemplates: async (jobType: string): Promise<ChecklistTemplate[]> => {
    const { data, error } = await supabase
      .from('checklist_templates')
      .select('*')
      .eq('job_type', jobType)
      .eq('is_active', true)
      .order('version', { ascending: false });
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },

  submitFieldReport: async (reportData: Partial<FieldReport>): Promise<FieldReport> => {
    const { data, error } = await supabase
      .from('field_reports')
      .insert(toSnakeCase(reportData))
      .select()
      .single();
    if (error) throw error;

    // Trigger notification
    const { data: { user } } = await supabase.auth.getUser();
    dispatchNotificationFromRules('field_report', {
        actorName: reportData.siteName || 'Field staff',
        actionText: `has submitted a ${reportData.jobType} report`,
        locString: '',
        actor: { 
            id: user?.id || reportData.userId || '', 
            name: user?.user_metadata?.name || 'Staff', 
            role: 'staff' 
        }
    });

    return toCamelCase(data);
  },

  getFieldReports: async (filter?: { startDate?: string, endDate?: string, page?: number, pageSize?: number, userId?: string, siteName?: string, userIds?: string[] }): Promise<any> => {
    let query = supabase.from('field_reports').select('*', { count: 'exact' });
    if (filter?.startDate) query = query.gte('created_at', filter.startDate);
    if (filter?.endDate) query = query.lte('created_at', filter.endDate);
    if (filter?.userId && filter.userId !== 'all') {
      query = query.eq('user_id', filter.userId);
    } else if (filter?.userIds && filter.userIds.length > 0) {
      query = query.in('user_id', filter.userIds);
    }
    if (filter?.siteName && filter.siteName !== 'all') query = query.eq('site_name', filter.siteName);
    
    const isPaginated = filter?.page !== undefined && filter?.pageSize !== undefined;
    if (isPaginated) {
      const from = (filter!.page! - 1) * filter!.pageSize!;
      const to = from + filter!.pageSize! - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query.order('created_at', { ascending: false });
    if (error) throw error;
    
    const formattedData = (data || []).map(toCamelCase);
    
    if (isPaginated) {
      return { data: formattedData, total: count || 0 };
    }
    return formattedData;
  },

  getFieldReportFilterOptions: async (userIds?: string[]): Promise<{ users: { id: string, name: string }[], sites: string[] }> => {
    let query = supabase.from('field_reports').select('user_id, site_name');
    if (userIds && userIds.length > 0) {
      query = query.in('user_id', userIds);
    }
    const { data: reports, error: reportsError } = await query;
    
    if (reportsError) throw reportsError;

    const uniqueUserIds = Array.from(new Set(reports.map(r => r.user_id)));
    const uniqueSites = Array.from(new Set(reports.map(r => r.site_name))).sort() as string[];

    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, name')
      .in('id', uniqueUserIds);
    
    if (usersError) throw usersError;

    return {
      users: (users || []).map(toCamelCase).sort((a: any, b: any) => a.name.localeCompare(b.name)),
      sites: uniqueSites
    };
  },

  getFieldReportById: async (id: string): Promise<FieldReport | null> => {
    const { data, error } = await supabase.from('field_reports').select('*').eq('id', id).single();
    if (error) throw error;
    return toCamelCase(data);
  },


  /**
   * Create a new user in Supabase Auth and the public users table in one call.
   * This method invokes the `admin-create-user` edge function which uses the
   * service role to create an auth user and then updates the `public.users`
   * table with the supplied role.  A verification email will be sent to the
   * specified address.  After creation, the newly created user record is
   * returned by looking it up via the email address.
   *
   * @param data An object containing the new user's name, email, password and role.
   * @returns The newly created user record.
   */
  createAuthUser: async (data: { name: string; email: string; password: string; role: string; }): Promise<User> => {
    const { name, email, password, role } = data;
    // Attempt to create the user via the Supabase edge function first.  The
    // edge function uses the service role key on the server to create an auth
    // user and update the public.users table with the specified role.  This
    // is the preferred path in production because it avoids exposing the
    // service role key to the browser.
    try {
      const { error: fnError } = await supabase.functions.invoke('admin-create-user', {
        body: { name, email, password, role },
      });
      if (fnError) {
        throw fnError;
      }
      // After creation, fetch the newly created user by email from our users
      // view.  The handle_new_user trigger should have inserted the row and
      // the edge function should have set the role.
      const allUsers = await api.getUsers();
      const newUser = allUsers.find(u => u.email === email);
      if (newUser) return newUser;
      console.warn('admin-create-user completed but user not found; falling back to client side signup');
    } catch (fnError: any) {
      // If the edge function call fails entirely (e.g. network error or not
      // deployed), we fall back to client side signup using the anon key.
      const msg = typeof fnError?.message === 'string' ? fnError.message : String(fnError);
      if (!msg.toLowerCase().includes('failed to send a request') && !msg.toLowerCase().includes('edge function')) {
        // For other errors (such as email already registered), surface them directly.
        throw fnError;
      }
      console.warn('Edge function not reachable (net::ERR_FAILED or similar), falling back to client side signup');
      // Create the auth user using the client side anon key.  This will send a
      // confirmation email automatically.  We include the name in user
      // metadata so it is persisted in auth.users.
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name } },
      });
      if (signUpError || !signUpData?.user) {
        // Handle rate limiting (429) specifically
        if (signUpError?.status === 429) {
          throw new Error('User creation rate limit reached. Please wait a few minutes before trying again or use the admin edge function if available.');
        }
        throw signUpError || new Error('Failed to sign up user');
      }
      const newAuthUser = signUpData.user;
      // Upsert into the public.users table.  This will create a row if it
      // doesn’t exist, and update the name and role if it does.  We use
      // upsert instead of update to handle the trigger delay between auth
      // signup and the creation of the profile row.
      try {
        const { error: upsertError } = await supabase.from('users').upsert(
          { id: newAuthUser.id, name, email, role_id: role },
          { onConflict: 'id' }
        );
        if (upsertError) throw upsertError;
      } catch (profileErr) {
        console.warn('Failed to upsert user profile after fallback signup (possible RLS violation):', profileErr);
        // We still return the user object because the Auth user was created
      }
      // Finally return a user object combining the known fields.
      return {
        id: newAuthUser.id,
        name,
        email,
        role,
        phone: undefined as any,
        organizationId: undefined as any,
        organizationName: undefined as any,
        reportingManagerId: undefined as any,
        photoUrl: undefined as any,
      } as User;
    }

    // Default return if no user found by either path.  This should rarely
    // occur; if it does, we return a minimal user object for consistency.
    return {
      id: '',
      name,
      email,
      role,
      phone: undefined as any,
      organizationId: undefined as any,
      organizationName: undefined as any,
      reportingManagerId: undefined as any,
      photoUrl: undefined as any,
    } as User;
  },
  getPolicies: async (): Promise<Policy[]> => {
    const { data, error } = await supabase.from('policies').select('*');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  createPolicy: async (data: Omit<Policy, 'id'>): Promise<Policy> => {
    const { data: inserted, error } = await supabase.from('policies').insert(toSnakeCase(data)).select().single();
    if (error) throw error;
    return toCamelCase(inserted);
  },
  getInsurances: async (): Promise<Insurance[]> => {
    const { data, error } = await supabase.from('insurances').select('*');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  createInsurance: async (data: Omit<Insurance, 'id'>): Promise<Insurance> => {
    const { data: inserted, error } = await supabase.from('insurances').insert(toSnakeCase(data)).select().single();
    if (error) throw error;
    return toCamelCase(inserted);
  },
  getApprovalWorkflowSettings: async (): Promise<{ finalConfirmationRole: UserRole }> => {
    const { data, error } = await supabase.from('settings').select('approval_workflow_settings').eq('id', 'singleton').single();
    if (error) throw error;
    if (!data?.approval_workflow_settings) throw new Error('Approval workflow settings are not configured.');
    return toCamelCase(data.approval_workflow_settings);
  },
  updateApprovalWorkflowSettings: async (role: UserRole): Promise<void> => {
    const { error } = await supabase.from('settings').update({ approval_workflow_settings: toSnakeCase({ finalConfirmationRole: role }) }).eq('id', 'singleton');
    if (error) throw error;
  },
  approveLeaveRequest: async (id: string, approverId: string): Promise<void> => {
    // Fetch request data including user_id, leave_type and dates
    const { data: request, error: fetchError } = await supabase.from('leave_requests').select('approval_history, user_id, leave_type, start_date, end_date, day_option').eq('id', id).single();
    if (fetchError) throw fetchError;
    
    // Check balance
    const balance = await api.getLeaveBalancesForUser(request.user_id);
    const leaveDays = request.day_option === 'half' ? 0.5 : differenceInCalendarDays(new Date(request.end_date), new Date(request.start_date)) + 1;
    
    const typeKeyStr = `${request.leave_type.toLowerCase()}Total`.replace('earnedtotal', 'earnedTotal').replace('sicktotal', 'sickTotal').replace('floatingtotal', 'floatingTotal').replace('compofftotal', 'compOffTotal');
    const typeKey = typeKeyStr as keyof LeaveBalance;
    const usedKey = typeKeyStr.replace('Total', 'Used') as keyof LeaveBalance;
    
    const available = (balance[typeKey] as number) - (balance[usedKey] as number);
    
    if (available < leaveDays) {
      // Auto-decline if insufficient leaves
      const reason = `Insufficient ${request.leave_type} balance. Available: ${available} days, Requested: ${leaveDays} days.`;
      await api.rejectLeaveRequest(id, approverId, reason);
      return;
    }

    const { finalConfirmationRole } = await api.getApprovalWorkflowSettings();
    const { data: approverData, error: nameError } = await supabase.from('users').select('name').eq('id', approverId).single();
    if (nameError) throw nameError;
    
    const newHistoryRecord = { approver_id: approverId, approver_name: approverData.name, status: 'approved', timestamp: new Date().toISOString() };
    const updatedHistory = [...((request.approval_history as any[]) || []), newHistoryRecord];
    
    // If it's a Comp Off leave, Manager approval is final.
    if (request.leave_type === 'Comp Off') {
       const { error } = await supabase.from('leave_requests').update({ 
        status: 'approved', 
        current_approver_id: null, 
        approval_history: updatedHistory 
      }).eq('id', id);
      if (error) throw error;
      
      // Dynamic Rule Dispatch
      dispatchNotificationFromRules('leave_approved', {
        actorName: 'Leave request',
        actionText: 'has been approved',
        locString: '',
        actor: { id: approverId, name: approverData.name, role: 'admin' }
      });

      // Consume comp off logs if applicable
      const leaveDays = request.day_option === 'half' ? 0.5 : differenceInCalendarDays(new Date(request.end_date), new Date(request.start_date)) + 1;
      const { data: compOffLogs } = await supabase.from('comp_off_logs').select('id').eq('user_id', request.user_id).eq('status', 'earned').limit(Math.ceil(leaveDays));
      if (compOffLogs && compOffLogs.length > 0) {
           await supabase.from('comp_off_logs').update({ status: 'used', leave_request_id: id }).in('id', compOffLogs.map(l => l.id));
      }
      return;
    }

    // Workflow Logic: Manager approved -> check finalConfirmationRole
    if (finalConfirmationRole === 'reporting_manager') {
         const { error } = await supabase.from('leave_requests').update({ 
            status: 'approved', 
            current_approver_id: null, 
            approval_history: updatedHistory 
          }).eq('id', id);
          if (error) throw error;
          
          dispatchNotificationFromRules('leave_approved', {
            actorName: 'Leave request',
            actionText: 'has been approved',
            locString: '',
            actor: { id: approverId, name: approverData.name, role: 'admin' }
          });
    } else {
        // Send to Final Approver (HR/Admin)
        const { data: finalApprover } = await supabase.from('users').select('id').eq('role_id', finalConfirmationRole).limit(1).single();
        const { error } = await supabase.from('leave_requests').update({ 
            status: 'pending_hr_confirmation', 
            current_approver_id: finalApprover?.id || null,
            approval_history: updatedHistory 
        }).eq('id', id);
        if (error) throw error;
    }
  },
  rejectLeaveRequest: async (id: string, approverId: string, reason = ''): Promise<void> => {
    const { data: request, error: fetchError } = await supabase.from('leave_requests').select('approval_history').eq('id', id).single();
    if (fetchError) throw fetchError;
    const { data: approverData, error: nameError } = await supabase.from('users').select('name').eq('id', approverId).single();
    if (nameError) throw nameError;
    const newHistoryRecord = { approver_id: approverId, approver_name: approverData.name, status: 'rejected', timestamp: new Date().toISOString(), comments: reason };
    const updatedHistory = [...((request.approval_history as any[]) || []), newHistoryRecord];
    const { error } = await supabase.from('leave_requests').update({ status: 'rejected', current_approver_id: null, approval_history: updatedHistory }).eq('id', id);
    if (error) throw error;

    // Dynamic Rule Dispatch
    dispatchNotificationFromRules('leave_rejected', {
      actorName: 'Leave request',
      actionText: 'has been rejected',
      locString: '',
      actor: { id: approverId, name: approverData.name, role: 'admin' }
    });
  },
  cancelApprovedLeave: async (id: string, cancellerId: string, reason: string): Promise<void> => {
    const { data: request, error: fetchError } = await supabase.from('leave_requests').select('approval_history, user_id, leave_type').eq('id', id).single();
    if (fetchError) throw fetchError;
    
    const { data: cancellerData } = await supabase.from('users').select('name').eq('id', cancellerId).single();
    
    const newHistoryRecord = { approver_id: cancellerId, approver_name: cancellerData?.name || 'System', status: 'cancelled', timestamp: new Date().toISOString(), comments: reason };
    const updatedHistory = [...((request.approval_history as any[]) || []), newHistoryRecord];
    
    const { error } = await supabase.from('leave_requests').update({ status: 'cancelled', current_approver_id: null, approval_history: updatedHistory }).eq('id', id);
    if (error) throw error;
    
    // Restore comp off if applicable
    if (request.leave_type === 'Comp Off') {
      await supabase.from('comp_off_logs').update({ status: 'earned', leave_request_id: null }).eq('leave_request_id', id);
    }
  },
  withdrawLeaveRequest: async (id: string, userId: string): Promise<void> => {
    const { data: request, error: fetchError } = await supabase.from('leave_requests').select('user_id, status').eq('id', id).single();
    if (fetchError) throw fetchError;
    if (request.user_id !== userId) throw new Error('Unauthorized to withdraw this request.');
    if (['approved', 'rejected', 'cancelled'].includes(request.status)) throw new Error('Cannot withdraw an already processed request.');
    
    const { error } = await supabase.from('leave_requests').update({ status: 'withdrawn', current_approver_id: null }).eq('id', id);
    if (error) throw error;
  },
  confirmLeaveByHR: async (id: string, hrId: string): Promise<void> => {
    const { data: request, error: fetchError } = await supabase.from('leave_requests').select('leave_type, user_id, approval_history').eq('id', id).single();
    if (fetchError) throw fetchError;
    const { data: approverData, error: nameError } = await supabase.from('users').select('name').eq('id', hrId).single();
    if (nameError) throw nameError;
    const newHistoryRecord = { approver_id: hrId, approver_name: approverData.name, status: 'approved', timestamp: new Date().toISOString(), comments: 'Final approval.' };
    const updatedHistory = [...((request.approval_history as any[]) || []), newHistoryRecord];
    const { error } = await supabase.from('leave_requests').update({ status: 'approved', current_approver_id: null, approval_history: updatedHistory }).eq('id', id);
    if (error) throw error;
    if (request.leave_type === 'Comp Off') {
      const { data: availableLog, error: logError } = await supabase.from('comp_off_logs').select('id').eq('user_id', request.user_id).eq('status', 'earned').limit(1).single();
      if (logError && logError.code !== 'PGRST116') throw logError;
      if (availableLog) await supabase.from('comp_off_logs').update({ status: 'used', leave_request_id: id }).eq('id', availableLog.id);
    }
  },
  submitExtraWorkClaim: async (claimData: Omit<ExtraWorkLog, 'id' | 'createdAt' | 'status'>): Promise<void> => {
    const { error } = await supabase.from('extra_work_logs').insert(toSnakeCase({ ...claimData, status: 'Pending' }));
    if (error) throw error;
  },
  getExtraWorkLogs: async (filter?: { userId?: string, status?: string, workDate?: string, page?: number, pageSize?: number }): Promise<{ data: ExtraWorkLog[], total: number }> => {
    let query = supabase.from('extra_work_logs').select('*', { count: 'exact' });
    if (filter?.userId) query = query.eq('user_id', filter.userId);
    if (filter?.status) query = query.eq('status', filter.status);
    if (filter?.workDate) query = query.eq('work_date', filter.workDate);
    
    if (filter?.page && filter?.pageSize) {
      const from = (filter.page - 1) * filter.pageSize;
      const to = from + filter.pageSize - 1;
      query = query.range(from, to);
    }

    const { data, count, error } = await query.order('work_date', { ascending: false });
    if (error) throw error;
    return { data: (data || []).map(toCamelCase), total: count || 0 };
  },
  approveExtraWorkClaim: async (claimId: string, approverId: string): Promise<void> => {
    const { data: approverData, error: nameError } = await supabase.from('users').select('name').eq('id', approverId).single();
    if (nameError) throw nameError;
    const { data: claim, error: fetchError } = await supabase.from('extra_work_logs').select('*').eq('id', claimId).single();
    if (fetchError) throw fetchError;
    if (!claim) throw new Error('Claim not found.');
    const { error: updateError } = await supabase.from('extra_work_logs').update({ status: 'Approved', approver_id: approverId, approver_name: approverData.name, approved_at: new Date().toISOString() }).eq('id', claimId);
    if (updateError) throw updateError;
    if (claim.claim_type === 'Comp Off') await api.addCompOffLog({ userId: claim.user_id, userName: claim.user_name, dateEarned: claim.work_date, reason: `Claim approved: ${claim.reason}`, status: 'earned', grantedById: approverId, grantedByName: approverData.name });
  },
  rejectExtraWorkClaim: async (claimId: string, approverId: string, reason: string): Promise<void> => {
    const { data: approverData, error: nameError } = await supabase.from('users').select('name').eq('id', approverId).single();
    if (nameError) throw nameError;
    const { error } = await supabase.from('extra_work_logs').update({ status: 'Rejected', approver_id: approverId, approver_name: approverData.name, rejection_reason: reason }).eq('id', claimId);
    if (error) throw error;
  },
  getManpowerDetails: async (siteId: string): Promise<ManpowerDetail[]> => {
    const { data, error } = await supabase.from('site_manpower').select('manpower_details').eq('organization_id', siteId).single();
    if (error && error.code !== 'PGRST116') throw error;
    return toCamelCase(data?.manpower_details || []);
  },
  updateManpowerDetails: async (siteId: string, details: ManpowerDetail[]): Promise<void> => {
    const { error } = await supabase.from('site_manpower').upsert({
      organization_id: siteId,
      manpower_details: toSnakeCase(details),
      updated_at: new Date().toISOString()
    }, { onConflict: 'organization_id' });
    if (error) throw error;
  },
  addCompOffLog: async (logData: Omit<CompOffLog, 'id'>): Promise<CompOffLog> => {
    const { data, error } = await supabase.from('comp_off_logs').insert(toSnakeCase(logData)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  exportAllData: async (): Promise<any> => {
    const tables = [
      'roles', 'organization_groups', 'companies', 'organizations', 'entities',
      'users', 'site_configurations', 'app_modules', 'onboarding_submissions',
      'settings', 'leave_requests', 'attendance_events', 'attendance_approvals',
      'locations', 'user_locations', 'notifications', 'tasks', 'notification_rules',
      'checklist_templates', 'field_reports', 'policies', 'insurances',
      'comp_off_logs', 'extra_work_logs', 'uniform_requests', 'field_attendance_violations',
      'biometric_devices', 'holidays', 'recurring_holidays', 'site_gents_uniform_configs',
      'site_ladies_uniform_configs', 'site_uniform_details_configs', 'support_tickets',
      'ticket_posts', 'ticket_comments', 'attendance_audit_logs'
    ];
    const data: Record<string, any> = {};
    for (const table of tables) {
      const { data: tableData, error } = await supabase.from(table).select('*');
      if (error) {
        console.warn(`Skipping table ${table}:`, error.message);
        continue;
      }
      data[table] = tableData;
    }
    return toCamelCase(data);
  },

  getBackups: async (): Promise<any[]> => {
    const { data, error } = await supabase
      .from('system_backups')
      .select('*, users(name)')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return (data || []).map(item => ({
      ...toCamelCase(item),
      createdByName: item.users?.name || 'System'
    }));
  },

  createBackup: async (name?: string, description?: string): Promise<any> => {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('Not authenticated');

    // Default name format: Paradigm DD-M-YYYY backup X
    let backupName = name;
    if (!backupName) {
      const now = new Date();
      const dateStr = `${now.getDate()}-${now.getMonth() + 1}-${now.getFullYear()}`;
      
      // Count existing backups for today to determine 'X'
      const { count } = await supabase
        .from('system_backups')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0]);
      
      backupName = `Paradigm ${dateStr} backup ${(count || 0) + 1}`;
    }

    // 1. Generate snapshot
    const snapshot = await api.exportAllData();
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    
    // 2. Upload to storage
    const fileName = `backup_${Date.now()}.json`;
    const filePath = `restoration_points/${fileName}`;
    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(filePath, blob);
    
    if (uploadError) {
      console.error('Storage Upload Error:', uploadError);
      if (uploadError.message.includes('not found') || (uploadError as any).status === 400) {
        throw new Error('Storage bucket "backups" not found. Please create it in the Supabase Dashboard.');
      }
      throw uploadError;
    }

    // 3. Record in DB
    const { data, error: dbError } = await supabase
      .from('system_backups')
      .insert({
        name: backupName,
        description,
        snapshot_path: filePath,
        size_bytes: blob.size,
        created_by: userData.user.id,
        status: 'completed'
      })
      .select()
      .single();
    
    if (dbError) throw dbError;
    return toCamelCase(data);
  },

  autoBackupCheck: async (): Promise<void> => {
    try {
      // 1. Check if enabled in settings
      const { data: settings } = await supabase
        .from('settings')
        .select('api_settings')
        .eq('id', 'singleton')
        .single();
      
      if (!settings?.api_settings?.auto_backup_enabled) return;

      // 2. Check if a backup already exists for today
      const { count } = await supabase
        .from('system_backups')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', new Date().toISOString().split('T')[0]);
      
      if (count && count > 0) return;

      // 3. Create backup if missing
      console.log('Triggering automated backup...');
      await api.createBackup();
    } catch (err) {
      console.error('Auto-backup failed:', err);
    }
  },

  restoreFromBackup: async (backupId: string): Promise<void> => {
    // 1. Get backup info
    const { data: backup, error: fetchError } = await supabase
      .from('system_backups')
      .select('*')
      .eq('id', backupId)
      .single();
    
    if (fetchError) throw fetchError;

    // 2. Download snapshot
    const { data: blob, error: downloadError } = await supabase.storage
      .from('backups')
      .download(backup.snapshot_path);
    
    if (downloadError) throw downloadError;

    const snapshotText = await blob.text();
    const snapshot = toSnakeCase(JSON.parse(snapshotText));

    // 3. Restoration logic (Critical section)
    // For each table in snapshot, clear and re-insert
    // Note: Tables must be cleared in reverse dependency order and filled in dependency order.
    // Order: Base -> Dependent
    const restorationOrder = [
      'roles', 'organization_groups', 'companies', 'organizations', 'entities',
      'users', 'site_configurations', 'app_modules', 'onboarding_submissions',
      'settings', 'leave_requests', 'attendance_events', 'attendance_approvals',
      'locations', 'user_locations', 'notifications', 'tasks', 'notification_rules',
      'checklist_templates', 'field_reports', 'policies', 'insurances',
      'comp_off_logs', 'extra_work_logs', 'uniform_requests', 'field_attendance_violations',
      'biometric_devices', 'holidays', 'recurring_holidays', 'site_gents_uniform_configs',
      'site_ladies_uniform_configs', 'site_uniform_details_configs', 'support_tickets',
      'ticket_posts', 'ticket_comments', 'attendance_audit_logs'
    ];

    for (const table of restorationOrder.reverse()) {
      if (!snapshot[table]) continue;
      // We don't delete everything blindly if it was missing from backup, but we do if it's in restorationOrder
      const { error: delError } = await supabase.from(table).delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
      if (delError) console.error(`Failed to clear table ${table}:`, delError);
    }

    for (const table of restorationOrder.reverse()) {
      if (!snapshot[table] || snapshot[table].length === 0) continue;
      const { error: insError } = await supabase.from(table).insert(snapshot[table]);
      if (insError) throw new Error(`Restoration failed at table ${table}: ${insError.message}`);
    }
  },
  getPincodeDetails: async (pincode: string): Promise<{ city: string; state: string; }> => {
    // This is a mock. A real implementation would use an external API.
    return new Promise(resolve => setTimeout(() => resolve({ city: 'Bengaluru', state: 'Karnataka' }), 500));
  },
  suggestDepartmentForDesignation: async (designation: string): Promise<string | null> => {
    const mapping: Record<string, string> = {
      'Security Guard': 'Security',
      'Housekeeping Staff': 'Housekeeping',
      'Site Manager': 'Management',
    };
    const key = Object.keys(mapping).find(key => designation.toLowerCase().includes(key.toLowerCase()));
    return Promise.resolve(key ? mapping[key] : null);
  },
  verifyBankAccountWithPerfios: async (data: PerfiosVerificationData): Promise<VerificationResult> => {
    console.log('Mock verifying bank account:', data);
    await new Promise(resolve => setTimeout(resolve, 1500));
    const success = Math.random() > 0.1; // 90% success rate
    return {
      success,
      message: success ? 'Bank account verified successfully.' : 'Account holder name did not match.',
      verifiedFields: { name: null, dob: null, aadhaar: null, bank: success, uan: null, esi: null, accountHolderName: success, accountNumber: success, ifscCode: true }
    };
  },
  verifyAadhaar: async (aadhaar: string): Promise<VerificationResult> => {
    console.log('Mock verifying Aadhaar:', aadhaar);
    await new Promise(resolve => setTimeout(resolve, 1000));
    const success = aadhaar.length === 12 && Math.random() > 0.1;
    return { success, message: success ? 'Aadhaar details verified.' : 'Invalid Aadhaar number.', verifiedFields: { name: null, dob: null, aadhaar: success, bank: null, uan: null, esi: null } };
  },
  lookupUan: async (uan: string): Promise<VerificationResult> => {
    console.log('Mock looking up UAN:', uan);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const success = uan.length === 12 && Math.random() > 0.1;
    return { success, message: success ? 'UAN found and linked.' : 'UAN not found in EPFO database.', verifiedFields: { name: null, dob: null, aadhaar: null, bank: null, uan: success, esi: null } };
  },
  extractDataFromImage: async (base64: string, mimeType: string, schema: any, docType?: string): Promise<any> => {
    // If AI is not available return an empty object.  This prevents the
    // application from crashing when running without an API key.  Otherwise,
    // call the Gemini model to extract structured data from the image.
    if (!ai) {
      console.warn('AI feature disabled: cannot extract data from image. Returning empty result.');
      return {};
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: `Extract the structured data from this document image. It is a ${docType || 'document'}.` },
          { inlineData: { data: base64, mimeType } }
        ]
      },
      config: {
        responseMimeType: 'application/json',
        responseSchema: schema,
      },
    });
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  },
  extractDataFromImageLocal: async (base64: string, docType?: string): Promise<any> => {
    const worker = await createWorker('eng');
    try {
        const { data: { text } } = await worker.recognize(`data:image/png;base64,${base64}`);
        const result: any = {};
        const normalizedText = text.replace(/\n/g, ' ');

        if (docType === 'PAN') {
            const panMatch = normalizedText.match(/[A-Z]{5}[0-9]{4}[A-Z]{1}/);
            if (panMatch) result.panNumber = panMatch[0];
            // Name extraction is very hard with raw OCR without keys
        } else if (docType === 'Aadhaar') {
            const aadhaarMatch = normalizedText.match(/\d{4}\s\d{4}\s\d{4}/);
            if (aadhaarMatch) result.aadhaarNumber = aadhaarMatch[0].replace(/\s/g, '');
        } else if (docType === 'Bank' || docType === 'Cheque') {
            const ifscMatch = normalizedText.match(/[A-Z]{4}0[A-Z0-9]{6}/);
            if (ifscMatch) result.ifscCode = ifscMatch[0];
            const acMatch = normalizedText.match(/\d{9,18}/);
            if (acMatch) result.accountNumber = acMatch[0];
        } else if (docType === 'Salary' || docType === 'UAN') {
            const uanMatch = normalizedText.match(/\d{12}/);
            if (uanMatch) result.uanNumber = uanMatch[0];
        }
        return result;
    } finally {
        await worker.terminate();
    }
  },
  crossVerifyNames: async (name1: string, name2: string): Promise<{ isMatch: boolean; reason: string }> => {
    // Without the AI client fall back to a simple case-insensitive
    // comparison.  Return a basic match result with a reason.  This ensures
    // the application continues to operate without a Google API key.
    if (!ai) {
      const isMatch = name1.trim().toLowerCase() === name2.trim().toLowerCase();
      return {
        isMatch,
        reason: isMatch ? 'Names are identical (case-insensitive match) without AI.' : 'AI disabled; simple case-insensitive comparison used.'
      };
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `Are these two names referring to the same person? Name 1: "${name1}", Name 2: "${name2}". Respond in JSON format with two keys: "isMatch" (boolean) and "reason" (a brief string explanation).`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isMatch: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          }
        }
      }
    });
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  },
  verifyFingerprintImage: async (base64: string, mimeType: string): Promise<{ containsFingerprints: boolean; reason: string }> => {
    // When AI is unavailable return a default response indicating that no
    // fingerprints were detected.  This fallback prevents runtime errors when
    // running the project without a Gemini API key.
    if (!ai) {
      return {
        containsFingerprints: false,
        reason: 'AI disabled; cannot detect fingerprints.'
      };
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { text: 'Does this image contain one or more human fingerprints? The image might be a scan from paper. Respond in JSON with "containsFingerprints" (boolean) and "reason" (string).' },
          { inlineData: { data: base64, mimeType } }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            containsFingerprints: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          }
        }
      }
    });
    const jsonStr = response.text.trim();
    return JSON.parse(jsonStr);
  },
  enhanceDocumentPhoto: async (base64: string, mimeType: string): Promise<string> => {
    // When AI is unavailable simply return the original image.  This ensures
    // document uploads still work without enhancement.
    if (!ai) {
      console.warn('AI disabled; returning original document photo without enhancement.');
      return base64;
    }
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: {
        parts: [
          { text: 'Enhance this document photo. Improve contrast, correct perspective to be flat, and make text as clear as possible. Return only the enhanced image.' },
          { inlineData: { data: base64, mimeType } }
        ]
      },
      config: {
        responseModalities: [Modality.IMAGE],
      },
    });
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
    throw new Error("AI did not return an enhanced image.");
  },
  getCompOffLogs: async (userId: string): Promise<CompOffLog[]> => {
    const { data, error } = await supabase.from('comp_off_logs').select('*').eq('user_id', userId).order('date_earned', { ascending: false });
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  checkCompOffTableExists: async (): Promise<void> => {
    const { error } = await supabase.from('comp_off_logs').select('id').limit(1);
    if (error) throw error;
  },
  getAllSiteAssets: async (): Promise<Record<string, Asset[]>> => {
    const { data, error } = await supabase.from('site_configurations').select('organization_id, config_data');
    if (error) throw error;
    const result: Record<string, Asset[]> = {};
    data.forEach(item => {
      const config = item.config_data as any;
      result[item.organization_id] = toCamelCase(config?.assets || []);
    });
    return result;
  },
  updateSiteAssets: async (siteId: string, assets: Asset[]): Promise<void> => {
    // Fetch existing config to avoid overwriting other fields
    const { data: existing, error: fetchError } = await supabase
      .from('site_configurations')
      .select('config_data')
      .eq('organization_id', siteId)
      .maybeSingle();
      
    if (fetchError) throw fetchError;

    const config = (existing?.config_data as any) || {};
    const updatedConfig = {
      ...config,
      assets: toSnakeCase(assets)
    };

    const { error: upsertError } = await supabase.from('site_configurations').upsert({
      organization_id: siteId,
      config_data: updatedConfig
    }, { onConflict: 'organization_id' });
    
    if (upsertError) throw upsertError;
  },
  getBackOfficeIdSeries: async (): Promise<BackOfficeIdSeries[]> => {
    const { data, error } = await supabase.from('settings').select('back_office_id_series').eq('id', 'singleton').single();
    if (error) throw error;
    return (data?.back_office_id_series || []).map(toCamelCase);
  },
  updateBackOfficeIdSeries: async (series: BackOfficeIdSeries[]): Promise<void> => {
    const { error } = await supabase.from('settings').upsert({
      id: 'singleton',
      back_office_id_series: toSnakeCase(series)
    }, { onConflict: 'id' });
    if (error) throw error;
  },
  getSiteStaffDesignations: async (): Promise<SiteStaffDesignation[]> => {
    const { data, error } = await supabase.from('settings').select('site_staff_designations').eq('id', 'singleton').single();
    if (error) throw error;
    return (data?.site_staff_designations || []).map(toCamelCase);
  },
  updateSiteStaffDesignations: async (designations: SiteStaffDesignation[]): Promise<void> => {
    const { error } = await supabase.from('settings').upsert({
      id: 'singleton',
      site_staff_designations: toSnakeCase(designations)
    }, { onConflict: 'id' });
    if (error) throw error;
  },
  getAllSiteIssuedTools: async (): Promise<Record<string, IssuedTool[]>> => {
    const { data, error } = await supabase.from('site_configurations').select('organization_id, config_data');
    if (error) throw error;
    const result: Record<string, IssuedTool[]> = {};
    data.forEach(item => {
      const config = item.config_data as any;
      result[item.organization_id] = toCamelCase(config?.issuedTools || []);
    });
    return result;
  },
  getToolsList: async (): Promise<MasterToolsList> => {
    const { data, error } = await supabase.from('settings').select('master_tools').eq('id', 'singleton').single();
    if (error) throw error;
    return toCamelCase(data.master_tools);
  },
  updateSiteIssuedTools: async (siteId: string, tools: IssuedTool[]): Promise<void> => {
    // Fetch existing config to avoid overwriting other fields
    const { data: existing, error: fetchError } = await supabase
      .from('site_configurations')
      .select('config_data')
      .eq('organization_id', siteId)
      .maybeSingle();
      
    if (fetchError) throw fetchError;

    const config = (existing?.config_data as any) || {};
    const updatedConfig = {
      ...config,
      issuedTools: toSnakeCase(tools)
    };

    const { error: upsertError } = await supabase.from('site_configurations').upsert({
      organization_id: siteId,
      config_data: updatedConfig
    }, { onConflict: 'organization_id' });
    
    if (upsertError) throw upsertError;
  },
  getAllSiteGentsUniforms: async (): Promise<Record<string, SiteGentsUniformConfig>> => {
    const { data, error } = await supabase.from('site_gents_uniform_configs').select('organization_id, config_data');
    if (error) throw error;
    const result: Record<string, SiteGentsUniformConfig> = {};
    data.forEach(item => {
      result[item.organization_id] = toCamelCase(item.config_data);
    });
    return result;
  },
  getMasterGentsUniforms: async (): Promise<MasterGentsUniforms> => {
    const { data, error } = await supabase.from('settings').select('master_gents_uniforms').eq('id', 'singleton').single();
    if (error) throw error;
    return toCamelCase(data.master_gents_uniforms || { pants: [], shirts: [] });
  },
  updateSiteGentsUniforms: async (siteId: string, config: SiteGentsUniformConfig): Promise<void> => {
    const { error } = await supabase.from('site_gents_uniform_configs').upsert({
      organization_id: siteId,
      config_data: toSnakeCase(config)
    }, { onConflict: 'organization_id' });
    if (error) throw error;
  },
  getAllSiteUniformDetails: async (): Promise<Record<string, SiteUniformDetailsConfig>> => {
    const { data, error } = await supabase.from('site_uniform_details_configs').select('organization_id, config_data');
    if (error) throw error;
    const result: Record<string, SiteUniformDetailsConfig> = {};
    data.forEach(item => {
      result[item.organization_id] = toCamelCase(item.config_data);
    });
    return result;
  },
  updateSiteUniformDetails: async (siteId: string, config: SiteUniformDetailsConfig): Promise<void> => {
    const { error } = await supabase.from('site_uniform_details_configs').upsert({
      organization_id: siteId,
      config_data: toSnakeCase(config)
    }, { onConflict: 'organization_id' });
    if (error) throw error;
  },
  getAllSiteLadiesUniforms: async (): Promise<Record<string, SiteLadiesUniformConfig>> => {
    const { data, error } = await supabase.from('site_ladies_uniform_configs').select('organization_id, config_data');
    if (error) throw error;
    const result: Record<string, SiteLadiesUniformConfig> = {};
    data.forEach(item => {
      result[item.organization_id] = toCamelCase(item.config_data);
    });
    return result;
  },
  getMasterLadiesUniforms: async (): Promise<MasterLadiesUniforms> => {
    const { data, error } = await supabase.from('settings').select('master_ladies_uniforms').eq('id', 'singleton').single();
    if (error) throw error;
    return toCamelCase(data.master_ladies_uniforms || { pants: [], shirts: [] });
  },
  updateSiteLadiesUniforms: async (siteId: string, config: SiteLadiesUniformConfig): Promise<void> => {
    const { error } = await supabase.from('site_ladies_uniform_configs').upsert({
      organization_id: siteId,
      config_data: toSnakeCase(config)
    }, { onConflict: 'organization_id' });
    if (error) throw error;
  },
  getUniformRequests: async (): Promise<UniformRequest[]> => {
    const { data, error } = await supabase.from('uniform_requests').select('*');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  submitUniformRequest: async (request: UniformRequest): Promise<UniformRequest> => {
    const { data, error } = await supabase.from('uniform_requests').insert(toSnakeCase(request)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  updateUniformRequest: async (request: UniformRequest): Promise<UniformRequest> => {
    const { data, error } = await supabase.from('uniform_requests').update(toSnakeCase(request)).eq('id', request.id).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  deleteUniformRequest: async (id: string): Promise<void> => {
    const { error } = await supabase.from('uniform_requests').delete().eq('id', id);
    if (error) throw error;
  },
  getInvoiceStatuses: async (date: Date): Promise<Record<string, 'Not Generated' | 'Generated' | 'Sent' | 'Paid'>> => {
    console.log('Mock fetching invoice statuses for', date);
    return Promise.resolve({});
  },
  getInvoiceSummaryData: async (siteId: string, date: Date): Promise<InvoiceData> => {
    console.log('Mock fetching invoice data for', siteId, date);
    return Promise.resolve({ siteName: 'Mock Site', siteAddress: 'Mock Address', invoiceNumber: 'INV-001', invoiceDate: '2023-01-31', statementMonth: 'January-2023', lineItems: [] });
  },
  getSupportTickets: async (): Promise<SupportTicket[]> => {
    const { data, error } = await supabase.from('support_tickets').select('*, posts:ticket_posts(*, comments:ticket_comments(*))');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  getSupportTicketById: async (id: string): Promise<SupportTicket | null> => {
    const { data, error } = await supabase.from('support_tickets').select('*, posts:ticket_posts(*, comments:ticket_comments(*))').eq('id', id).single();
    if (error) throw error;
    return toCamelCase(data);
  },
  createSupportTicket: async (ticketData: Partial<SupportTicket>): Promise<SupportTicket> => {
    // If an attachment was provided with a File object, upload it to the support attachments bucket
    const attachment: any = (ticketData as any).attachment;
    if (attachment && attachment.file instanceof File) {
      try {
        const { path } = await api.uploadDocument(attachment.file as File, SUPPORT_ATTACHMENTS_BUCKET);
        (ticketData as any).attachment = {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          path,
        };
      } catch (uploadErr) {
        console.error('Failed to upload support ticket attachment:', uploadErr);
        // Remove attachment to prevent sending File object to database
        delete (ticketData as any).attachment;
      }
    }
    const { data, error } = await supabase.from('support_tickets').insert(toSnakeCase(ticketData)).select('*, posts:ticket_posts(*, comments:ticket_comments(*))').single();
    if (error) throw error;

    // Trigger notification
    dispatchNotificationFromRules('support_ticket', {
        actorName: ticketData.raisedByName || 'A user',
        actionText: 'has raised a new support ticket',
        locString: `: ${ticketData.title}`,
        actor: { id: ticketData.raisedById || '', name: ticketData.raisedByName || 'User', role: 'staff' }
    });

    return toCamelCase(data);
  },
  updateSupportTicket: async (id: string, updates: Partial<SupportTicket>): Promise<SupportTicket> => {
    // Handle attachment upload when updating a ticket
    const attachment: any = (updates as any).attachment;
    if (attachment && attachment.file instanceof File) {
      try {
        const { path } = await api.uploadDocument(attachment.file as File, SUPPORT_ATTACHMENTS_BUCKET);
        (updates as any).attachment = {
          name: attachment.name,
          type: attachment.type,
          size: attachment.size,
          path,
        };
      } catch (uploadErr) {
        console.error('Failed to upload updated support ticket attachment:', uploadErr);
        delete (updates as any).attachment;
      }
    }
    const { data, error } = await supabase.from('support_tickets').update(toSnakeCase(updates)).eq('id', id).select('*, posts:ticket_posts(*, comments:ticket_comments(*))').single();
    if (error) throw error;
    return toCamelCase(data);
  },
  addTicketPost: async (ticketId: string, postData: Partial<TicketPost>): Promise<TicketPost> => {
    const { data, error } = await supabase.from('ticket_posts').insert(toSnakeCase(postData)).select('*, comments:ticket_comments(*)').single();
    if (error) throw error;

    // Trigger notification
    dispatchNotificationFromRules('support_response', {
        actorName: postData.authorName || 'Staff',
        actionText: 'has responded to a support ticket',
        locString: '',
        actor: { id: postData.authorId || '', name: postData.authorName || 'Staff', role: postData.authorRole || 'hr' }
    });

    return toCamelCase(data);
  },
  togglePostLike: async (postId: string, userId: string): Promise<void> => {
    const { data, error } = await supabase.from('ticket_posts').select('likes').eq('id', postId).single();
    if (error) throw error;
    const likes = (data.likes as string[]) || [];
    const newLikes = likes.includes(userId) ? likes.filter(id => id !== userId) : [...likes, userId];
    const { error: updateError } = await supabase.from('ticket_posts').update({ likes: newLikes }).eq('id', postId);
    if (updateError) throw updateError;
  },
  addPostComment: async (postId: string, commentData: Partial<TicketComment>): Promise<TicketComment> => {
    const { data, error } = await supabase.from('ticket_comments').insert(toSnakeCase(commentData)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  getVerificationCostBreakdown: async (startDate: string, endDate: string): Promise<SubmissionCostBreakdown[]> => {
    const { data, error } = await supabase.from('onboarding_submissions').select('id, employee_id, personal, enrollment_date, verification_usage').gte('enrollment_date', startDate).lte('enrollment_date', endDate);
    if (error) throw error;

    return (data || []).map(sub => {
      const camelSub = toCamelCase(sub);
      return {
        id: camelSub.id,
        employeeId: camelSub.personal.employeeId,
        employeeName: `${camelSub.personal.firstName} ${camelSub.personal.lastName}`,
        enrollmentDate: camelSub.enrollmentDate,
        totalCost: 0, // Will be calculated on the frontend
        breakdown: camelSub.verificationUsage || [],
      }
    });
  },

  generatePdf: async (content: string | HTMLElement, options: any): Promise<void> => {
    try {
      // @ts-ignore
      const html2pdf = (await import('html2pdf.js')).default;
      await html2pdf().set(options).from(content).save();
    } catch (error) {
      console.error('PDF generation failed:', error);
      throw error;
    }
  },

  /**
   * Batch resolve addresses for a list of coordinates.
   * Checks Supabase 'location_cache' first, then fetches from Nominatim for missing ones,
   * and caches the results.
   */
  batchResolveAddresses: async (coords: { lat: number; lon: number }[]): Promise<Record<string, string>> => {
    if (coords.length === 0) return {};

    // Normalize coordinates to 6 decimal places for consistent key generation
    const normalizeCoord = (n: number) => parseFloat(n.toFixed(6));

    const uniqueCoords = Array.from(new Set(coords.map(c => `${normalizeCoord(c.lat)},${normalizeCoord(c.lon)}`)))
      .map(s => {
        const [lat, lon] = s.split(',').map(Number);
        return { lat, lon };
      });

    const resultMap: Record<string, string> = {};
    const missingCoords: { lat: number; lon: number }[] = [];

    // 1. Check Cache in Supabase
    // Fetch cache entries that match any of the latitudes (approximate filter)
    const lats = uniqueCoords.map(c => c.lat);
    const { data: cachedData, error } = await supabase
      .from('location_cache')
      .select('*')
      .in('latitude', lats);

    if (!error && cachedData) {
      cachedData.forEach((row: any) => {
        // Normalize database values for comparison
        const dbLat = normalizeCoord(parseFloat(row.latitude));
        const dbLon = normalizeCoord(parseFloat(row.longitude));
        const key = `${dbLat},${dbLon}`;

        // Verify exact match including longitude
        if (uniqueCoords.some(c => normalizeCoord(c.lat) === dbLat && normalizeCoord(c.lon) === dbLon)) {
          resultMap[key] = row.address;
        }
      });
    }

    // 2. Identify Missing
    uniqueCoords.forEach(c => {
      const key = `${normalizeCoord(c.lat)},${normalizeCoord(c.lon)}`;
      if (!resultMap[key]) {
        missingCoords.push(c);
      }
    });

    console.log('Geocoding API: Found', Object.keys(resultMap).length, 'cached,', missingCoords.length, 'missing');

    // 3. Fetch Missing from Nominatim & Cache
    // We must rate limit this to avoid banning. 1 request per second is safe.
    for (const coord of missingCoords) {
      try {
        const address = await import('../utils/locationUtils').then(m => m.reverseGeocode(coord.lat, coord.lon));

        const key = `${normalizeCoord(coord.lat)},${normalizeCoord(coord.lon)}`;
        resultMap[key] = address;

        // Insert into Cache
        await supabase.from('location_cache').insert({
          latitude: normalizeCoord(coord.lat),
          longitude: normalizeCoord(coord.lon),
          address: address
        });

        console.log('Geocoding API: Fetched and cached', key, '->', address);

        // Delay to respect API rate limits
        await new Promise(r => setTimeout(r, 1000));
      } catch (e) {
        console.error(`Failed to resolve address for ${coord.lat},${coord.lon}`, e);
        const key = `${normalizeCoord(coord.lat)},${normalizeCoord(coord.lon)}`;
        resultMap[key] = `${coord.lat.toFixed(4)}, ${coord.lon.toFixed(4)}`;
      }
    }

    return resultMap;
  },

  /**
   * Send a security alert notification to the user's reporting manager about
   * developer mode, location spoofing, or other security violations.
   */
  sendSecurityAlert: async (userId: string, userName: string, violationType: 'developer_mode' | 'location_spoofing', deviceInfo?: string): Promise<void> => {
    // Get the user's reporting manager
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('reporting_manager_id')
      .eq('id', userId)
      .single();

    if (userError || !userData?.reporting_manager_id) {
      console.warn('Could not find reporting manager for security alert');
      return;
    }

    const violationMessage = violationType === 'developer_mode'
      ? 'attempted to access the application with Developer Mode enabled'
      : 'attempted to access the application with Location Spoofing detected';

    const deviceText = deviceInfo ? ` using device: ${deviceInfo}` : '';

    await api.createNotification({
      userId: userData.reporting_manager_id,
      title: '🔒 Security Alert',
      message: `${userName} ${violationMessage}${deviceText}. Access was blocked for security reasons.`,
      type: 'security',
      link: `/user-management`, // Link to user management or security dashboard
    });
  },

  /**
   * Send a device change alert notification to the user's reporting manager.
   */
  sendDeviceChangeAlert: async (userId: string, userName: string, oldDevice: string, newDevice: string): Promise<void> => {
    // Get the user's reporting manager
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('reporting_manager_id')
      .eq('id', userId)
      .single();

    if (userError || !userData?.reporting_manager_id) {
      console.warn('Could not find reporting manager for device change alert');
      return;
    }

    await api.createNotification({
      userId: userData.reporting_manager_id,
      title: '📱 Device Change Detected',
      message: `${userName} logged in from a new device. Previous device: ${oldDevice}, New device: ${newDevice}`,
      type: 'info',
      link: `/user-management`,
    });
  },
  getBiometricDevices: async (): Promise<BiometricDevice[]> => {
    const { data, error } = await supabase
      .from('biometric_devices')
      .select('*, organization:organizations(short_name)')
      .order('name');
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },
  addBiometricDevice: async (device: Partial<BiometricDevice>): Promise<BiometricDevice> => {
    const dataToInsert = { ...device };
    if (dataToInsert.sn) dataToInsert.sn = dataToInsert.sn.toLowerCase();
    const { data, error } = await supabase.from('biometric_devices').insert(toSnakeCase(dataToInsert)).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },
  deleteBiometricDevice: async (id: string): Promise<void> => {
    const { error } = await supabase.from('biometric_devices').delete().eq('id', id);
    if (error) throw error;
  },
  updateBiometricDevice: async (id: string, device: Partial<BiometricDevice>): Promise<BiometricDevice> => {
    const dataToUpdate = { ...device };
    if (dataToUpdate.sn) dataToUpdate.sn = dataToUpdate.sn.toLowerCase();
    const { data, error } = await supabase.from('biometric_devices').update(toSnakeCase(dataToUpdate)).eq('id', id).select().single();
    if (error) throw error;
    return toCamelCase(data);
  },

  // --- Geofencing Violations & Settings ---
  
  getViolations: async (userId: string, month?: string): Promise<any[]> => {
    let query = supabase.from('attendance_violations').select('*').eq('user_id', userId);
    if (month) {
      query = query.eq('violation_month', month);
    }
    const { data, error } = await query.order('violation_date', { ascending: false });
    if (error) throw error;
    return (data || []).map(toCamelCase);
  },

  addViolation: async (violationData: Partial<any>): Promise<any> => {
    const { data, error } = await supabase
      .from('attendance_violations')
      .insert(toSnakeCase(violationData))
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? toCamelCase(data) : null;
  },

  getViolationCount: async (userId: string, month: string): Promise<number> => {
    const { count, error } = await supabase
      .from('attendance_violations')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('violation_month', month);
    if (error) throw error;
    return count || 0;
  },

  resetViolations: async (userId: string, month: string, reason: string, adminId: string): Promise<void> => {
    // Get current violation count
    const count = await api.getViolationCount(userId, month);
    
    // Record the reset
    const { error: resetError } = await supabase
      .from('violation_resets')
      .insert(toSnakeCase({
        userId,
        resetMonth: month,
        previousViolationCount: count,
        resetBy: adminId,
        resetReason: reason
      }));
    if (resetError) throw resetError;

    // Delete violations for the month
    const { error: deleteError } = await supabase
      .from('attendance_violations')
      .delete()
      .eq('user_id', userId)
      .eq('violation_month', month);
    if (deleteError) throw deleteError;

    // Lift salary hold
    const { error: updateError } = await supabase
      .from('users')
      .update({
        salary_hold: false,
        salary_hold_reason: null,
        salary_hold_date: null
      })
      .eq('id', userId);
    if (updateError) throw updateError;
  },

  getResetHistory: async (userId?: string): Promise<any[]> => {
    let query = supabase
      .from('violation_resets')
      .select(`
        *,
        user:users!violation_resets_user_id_fkey(name),
        admin:users!violation_resets_reset_by_fkey(name)
      `);
    
    if (userId) {
      query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query.order('reset_at', { ascending: false });
    if (error) throw error;
    
    return (data || []).map(item => ({
      ...toCamelCase(item),
      userName: item.user?.name,
      resetByName: item.admin?.name
    }));
  },

  setSalaryHold: async (userId: string, status: boolean, reason?: string): Promise<void> => {
    const { error } = await supabase
      .from('users')
      .update({
        salary_hold: status,
        salary_hold_reason: reason || null,
        salary_hold_date: status ? new Date().toISOString() : null
      })
      .eq('id', userId);
    if (error) throw error;
  },

  getGeofencingSettings: async (): Promise<any> => {
    const { data, error } = await supabase
      .from('settings')
      .select('geofencing_verification_enabled, max_violations_per_month')
      .eq('id', 'singleton')
      .maybeSingle();
    
    if (error) throw error;
    
    return {
      enabled: data?.geofencing_verification_enabled ?? false,
      maxViolationsPerMonth: data?.max_violations_per_month ?? 3
    };
  },

  updateGeofencingSettings: async (settings: { enabled?: boolean; maxViolationsPerMonth?: number }): Promise<void> => {
    const updates: any = {};
    
    if (settings.enabled !== undefined) {
      updates.geofencing_verification_enabled = settings.enabled;
    }
    
    if (settings.maxViolationsPerMonth !== undefined) {
      updates.max_violations_per_month = settings.maxViolationsPerMonth;
    }
    
    const { error } = await supabase
      .from('settings')
      .update(updates)
      .eq('id', 'singleton');
    
    if (error) throw error;
  },
  
  sendFieldReport: async (reportId: string, pdfBlob: Blob, managerId: string, managerName: string, submitterName: string): Promise<void> => {
    // 1. Upload PDF to Storage (Use Task Attachments bucket as it exists)
    const fileName = `field-reports/${reportId}_${Date.now()}.pdf`;
    const { error: uploadError } = await supabase.storage
        .from(TASK_ATTACHMENTS_BUCKET) 
        .upload(fileName, pdfBlob, { upsert: true });

    if (uploadError) {
        console.error("PDF Upload Failed:", uploadError);
        // Continue anyway to at least send notification
    }

    const { data: { publicUrl } } = supabase.storage.from(TASK_ATTACHMENTS_BUCKET).getPublicUrl(fileName);

    // 2. Real Email Sending via Edge Function
    let emailSent = false;
    try {
        console.log("Invoking sending-email function...");
        const { error: fnError } = await supabase.functions.invoke('send-email', {
            body: {
                to: [managerId === 'f06f05d9-cf5f-4e4d-a0b4-9534fd2d1e7b' ? 'sudhan@paradigmfms.com' : 'sudhan@paradigmfms.com'], // Hardcoded for testing as requested
                subject: `New Field Report from ${submitterName}`,
                html: `<p>Hi,</p><p>${submitterName} has submitted a new field report.</p><p><a href="${publicUrl}">Click here to view the report</a></p>`,
                attachments: [
                    {
                        filename: `FieldReport_${reportId.substring(0,8)}.pdf`,
                        path: publicUrl
                    }
                ]
            }
        });
        
        if (fnError) {
             console.error("Edge function failed:", fnError);
             throw fnError;
        }
        emailSent = true;
        console.log("Email sent successfully via backend.");
    } catch (emailErr) {
        console.error("Backend email failed, falling back to client-side:", emailErr);
    }

    // 3. Create In-App Notification using correct schema (user_id, message, type)
    try {
        await api.createNotification({
            userId: managerId,
            message: `New Field Report: ${submitterName} has submitted report ${reportId.substring(0, 8)}.`,
            type: 'info',
        });
    } catch (notifErr) {
        console.error("Failed to send notification:", notifErr);
    }

    // 4. Trigger Real Email Client (Mailto) - ONLY if backend failed
    if (!emailSent) {
        const subject = encodeURIComponent(`New Field Report from ${submitterName}`);
        const body = encodeURIComponent(`Hi,\n\nPlease find the field report attached:\n${publicUrl}\n\nSubmitted by: ${submitterName}\nReport ID: ${reportId}`);
        
         setTimeout(() => {
            window.open(`mailto:sudhan@paradigmfms.com?subject=${subject}&body=${body}`, '_blank');
        }, 500);
    }
  },

  // Field Staff Violations Management
  async getFieldViolations(userId: string): Promise<FieldAttendanceViolation[]> {
    const { data, error } = await supabase
      .from('field_attendance_violations')
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false });

    if (error) {
      console.error('Error fetching field violations:', error);
      throw error;
    }

    return data.map(v => ({
      id: v.id,
      userId: v.user_id,
      date: v.date,
      totalHours: parseFloat(v.total_hours),
      siteHours: parseFloat(v.site_hours),
      travelHours: parseFloat(v.travel_hours),
      sitePercentage: parseFloat(v.site_percentage),
      travelPercentage: parseFloat(v.travel_percentage),
      violationType: v.violation_type,
      requiredSitePercentage: parseFloat(v.required_site_percentage),
      status: v.status,
      acknowledgedBy: v.acknowledged_by,
      acknowledgedAt: v.acknowledged_at,
      managerNotes: v.manager_notes,
      escalatedTo: v.escalated_to,
      escalatedAt: v.escalated_at,
      escalationLevel: v.escalation_level,
      affectsSalary: v.affects_salary,
      affectsPerformance: v.affects_performance,
      attendanceGranted: v.attendance_granted,
      createdAt: v.created_at,
      updatedAt: v.updated_at,
    }));
  },

  async createFieldViolation(violationData: Partial<FieldAttendanceViolation>): Promise<FieldAttendanceViolation> {
    const { data, error } = await supabase
      .from('field_attendance_violations')
      .insert(toSnakeCase(violationData))
      .select()
      .maybeSingle();
    if (error) throw error;
    return data ? toCamelCase(data) : null;
  },

  async acknowledgeFieldViolation(violationId: string, notes: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { error } = await supabase
      .from('field_attendance_violations')
      .update({
        status: 'acknowledged',
        acknowledged_by: user.id,
        acknowledged_at: new Date().toISOString(),
        manager_notes: notes,
        attendance_granted: true,
      })
      .eq('id', violationId);

    if (error) {
      console.error('Error acknowledging violation:', error);
      throw error;
    }
  },

  async exportFieldViolations(userId: string, userName: string): Promise<void> {
    const violations = await this.getFieldViolations(userId);
    
    // Generate CSV content
    const headers = [
      'Date',
      'Violation Type',
      'Total Hours',
      'Site Hours',
      'Site %',
      'Travel Hours',
      'Travel %',
      'Required Site %',
      'Status',
      'Acknowledged By',
      'Acknowledged At',
      'Notes'
    ].join(',');

    const rows = violations.map(v => [
      v.date,
      v.violationType,
      v.totalHours.toFixed(2),
      v.siteHours.toFixed(2),
      v.sitePercentage.toFixed(1),
      v.travelHours.toFixed(2),
      v.travelPercentage.toFixed(1),
      v.requiredSitePercentage,
      v.status,
      v.acknowledgedBy || '',
      v.acknowledgedAt || '',
      `"${v.managerNotes || ''}"`,
    ].join(','));

    const csv = [headers, ...rows].join('\n');

    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${userName}_violations_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },

  async processFieldAttendance(userId: string, date: string): Promise<void> {
    try {
      // 1. Fetch events for the day
      const start = startOfDay(new Date(date)).toISOString();
      const end = endOfDay(new Date(date)).toISOString();
      const events = await this.getAttendanceEvents(userId, start, end);
      
      if (events.length === 0) return;

      // 2. Calculate breakdown
      const breakdown = calculateSiteTravelTime(events);
      
      // 3. Fetch settings
      const settings = await this.getAttendanceSettings();
      const user = await this.getUserById(userId);
      if (!user || user.role !== 'field_staff') return;

      const rules = settings.field;
      if (!rules.enableSiteTimeTracking) return;

      // 4. Validate
      const minHoursFull = rules.dailyWorkingHours?.max || 9;
      const minHoursHalf = rules.dailyWorkingHours?.min || 7;

      const validation = validateFieldStaffAttendance(breakdown, {
        minimumSitePercentage: rules.minimumSitePercentage || 75,
        minimumHoursFullDay: minHoursFull,
        minimumHoursHalfDay: minHoursHalf,
      });

      // 5. Handle violations
      const existingViolations = await this.getFieldViolations(userId);
      const existingForDay = existingViolations.find(v => v.date === date);

      if (!validation.isValid) {
        const violationType = validation.violations.includes('site_time_low') ? 'site_time_low' : 'insufficient_hours';
        
        if (existingForDay) {
          if (existingForDay.status === 'pending') {
            // Update existing pending violation
            await supabase
              .from('field_attendance_violations')
              .update(toSnakeCase({
                ...breakdown,
                violationType,
                requiredSitePercentage: rules.minimumSitePercentage || 75,
              }))
              .eq('id', existingForDay.id);
          }
        } else {
          // Create new violation
          await this.createFieldViolation({
            userId,
            date,
            ...breakdown,
            violationType,
            requiredSitePercentage: rules.minimumSitePercentage || 75,
            status: 'pending',
            affectsSalary: true,
            affectsPerformance: true,
          });

          // Send notification to manager
          if (user.reportingManagerId) {
            await this.createNotification({
              userId: user.reportingManagerId,
              message: `Field staff ${user.name} has a site time violation for ${format(new Date(date), 'MMM dd')}. Site percentage: ${breakdown.sitePercentage.toFixed(1)}%`,
              type: 'security',
            });
          }
        }
      } else if (existingForDay && existingForDay.status === 'pending') {
        // Violation was fixed (e.g. user visited more sites later in the day)
        // We can either delete it or mark it as resolved.
        // For now, let's delete pending violations that are no longer valid.
        await supabase
          .from('field_attendance_violations')
          .delete()
          .eq('id', existingForDay.id);
      }
    } catch (error) {
      console.error('Error processing field attendance violations:', error);
    }
  }
};