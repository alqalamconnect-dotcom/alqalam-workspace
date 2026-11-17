import { supabase } from './supabase';

export async function logActivity(data: {
    userId: string;
    userName: string;
    actionType: string;
    targetName?: string;
    targetId?: string;
    details?: string;
}) {
    try {
        await supabase.from('activity_logs').insert({
            user_id: data.userId,
            user_name: data.userName,
            action_type: data.actionType,
            target_name: data.targetName || null,
            target_id: data.targetId || null,
            details: data.details || null,
        });
    } catch (error) {
        console.error('Failed to log activity:', error);
    }
}
