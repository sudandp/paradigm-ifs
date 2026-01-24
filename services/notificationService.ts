import { supabase } from './supabase';

export interface NotificationActor {
    id: string;
    name: string;
    reportingManagerId?: string;
    role: string;
}

export interface NotificationData {
    actorName: string;
    actionText: string;
    locString: string;
    title?: string;
    link?: string;
    actor: NotificationActor;
}

/**
 * Dispatches notifications to recipients based on rules configured in the database.
 * This function identifies active rules for the given event type and role/user,
 * then creates individual notification records for each recipient.
 */
export const dispatchNotificationFromRules = async (eventType: string, data: NotificationData) => {
    try {
        // Fetch rules directly instead of using api.getNotificationRules
        const { data: rulesData, error: rulesError } = await supabase
            .from('notification_rules')
            .select('*')
            .order('created_at', { ascending: false });
            
        if (rulesError) throw rulesError;
        const rules = (rulesData || []).map(r => ({
            id: r.id,
            eventType: r.event_type,
            recipientRole: r.recipient_role,
            recipientUserId: r.recipient_user_id,
            isEnabled: r.is_enabled
        }));

        const activeRules = rules.filter(r => r.eventType === eventType && r.isEnabled);
        
        const recipients: Set<string> = new Set();
        
        for (const rule of activeRules) {
            if (rule.recipientUserId) {
                if (rule.recipientUserId === 'all') {
                    // Fetch all active users
                    const { data: allUsers, error } = await supabase.from('users').select('id');
                    if (!error && allUsers) {
                        allUsers.forEach(u => recipients.add(u.id));
                    }
                } else {
                    recipients.add(rule.recipientUserId);
                }
            } else if (rule.recipientRole) {
                if (rule.recipientRole === 'direct_manager') {
                    if (data.actor.reportingManagerId) {
                        recipients.add(data.actor.reportingManagerId);
                    }
                } else {
                    // Fetch users with this specific role
                    const { data: users, error } = await supabase.from('users').select('id').eq('role', rule.recipientRole);
                    if (!error && users) {
                        users.forEach(u => recipients.add(u.id));
                    }
                }
            }
        }

        // Remove the actor themselves from the recipient list if they are in it
        recipients.delete(data.actor.id);

        if (recipients.size > 0) {
            const message = `${data.actorName} ${data.actionText}${data.locString}`;
            const notifications = Array.from(recipients).map(userId => ({
                user_id: userId,
                message,
                title: data.title || 'System Alert',
                type: getNotificationTypeForEvent(eventType),
                link_to: data.link
            }));
            
            await supabase.from('notifications').insert(notifications);
        }
    } catch (err) {
        console.warn(`Failed to dispatch notifications for ${eventType}:`, err);
    }
};

/**
 * Maps a system event type to a UI notification category.
 */
const getNotificationTypeForEvent = (eventType: string): any => {
    if (eventType === 'violation' || eventType.includes('rejected') || eventType.includes('security')) {
        return 'security';
    }
    if (eventType.includes('task')) {
        return 'task_assigned';
    }
    return 'info';
};
