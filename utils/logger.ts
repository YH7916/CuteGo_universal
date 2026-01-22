import { supabase } from './supabaseClient';

export const logEvent = async (eventType: 'app_start' | 'ai_request') => {
    try {
        // 获取当前用户（如果有）
        const { data: { user } } = await supabase.auth.getUser();
        
        // 异步发送，不阻塞主线程，不通过 await 等待结果
        // 这样即使网络差，也不会卡顿用户的下棋体验
        supabase.from('activity_logs').insert({
            event_type: eventType,
            user_id: user?.id || null
        }).then(({ error }) => {
            if (error) console.warn('Log failed:', error.message);
        });
    } catch (e) {
        // 忽略所有日志错误，不要因为统计挂了影响用户玩游戏
    }
};
