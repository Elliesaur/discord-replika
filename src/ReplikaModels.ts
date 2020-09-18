export type Message = {
    id: string;
    content: MessageContent;
    meta: MessageMeta;
    widget ? : MessageWidget;
    effects ? : MessageEffect;
};

export type MessageMeta = {
    client_token: string;
    bot_id: string;
    chat_id: string;
    nature ? : MessageNature;
    timestamp ? : string;
    author_id ? : string;
    permitted_actions ? : MessageActionType[];
};
export type MessageNature = 'Customer' | 'Operator' | 'Robot';
export type MessageActionType = |
    'Upvote' |
    'Downvote' |
    'Love' |
    'Funny' |
    'Offensive' |
    'Meaningless';

export type MessageContent = |
    TextMessageContent |
    ImageMessageContent |
    ServiceMessageContent |
    VoiceRecordMessageContent |
    VoiceRecognizedMessageContent |
    AchievementMessageContent;

export type MessageWidget = |
    SelectWidget |
    MoodMeterWidget |
    TitledTextFieldWidget |
    ScaleWidget |
    MultiselectWidget |
    AiDrawWidget |
    UsernameWidget |
    BotNameWidget |
    AppNavigationWidget |
    MissionRecommendationWidget;

export type SelectWidget = {
    id: string;
    type: 'select';
    items: SelectWidgetItem[];
    shuffle: boolean;
};
export type SelectWidgetItem = {
    id: string;
    title: string;
    sticky ? : boolean;
};
export type MoodMeterItem = {
    score: number;
    title: string;
};

export type MoodMeterWidget = {
    id: string;
    type: 'mood_meter';
    items: MoodMeterItem[];
};

export type TitledTextFieldWidget = {
    id: string;
    type: 'titled_text_field';
    title: string;
    skip_enabled: boolean;
};

export type ScaleWidgetItem = {
    id: string;
    title: string;
};

export type ScaleWidget = {
    id: string;
    type: 'scale';
    items: ScaleWidgetItem[];
    skip_enabled: boolean;
};

export type MultiselectWidgetItem = {
    id: string;
    title: string;
};

export type MultiselectWidget = {
    id: string;
    type: 'multiselect';
    items: MultiselectWidgetItem[];
    multiple_selection: boolean;
    min_item_selected: number;
    max_item_selected: number;
    skip_enabled: boolean;
};

export type AiDrawWidget = {
    id: string;
    type: 'ai_draw';
    skip_enabled: boolean;
};

export type UsernameWidget = {
    id: string;
    type: 'user_name';
    title: string;
};

export type BotNameWidget = {
    id: string;
    type: 'bot_name';
    title: string;
};

export type AppNavigationAction = |
    {
        type: 'profile';
    } |
    {
        type: 'journey';
    } |
    {
        type: 'relationship_settings';
    };

export type AppNavigationItem = {
    id: string;
    title: string;
    action: AppNavigationAction;
};

export type AppNavigationWidget = {
    id: string;
    type: 'app_navigation';
    items: AppNavigationItem[];
    skip_enabled: boolean;
    skip_button_name ? : string;
};

export type MissionRecommendationWidget = {
    id: string;
    type: 'mission_recommendation';
    mission: BriefMission;
    skip_enabled: boolean;
};
export type BriefMission = {
    id: string;
    title: string;
    description: string;
    track_image_url: string;
    duration: string;
    gives_skill: boolean;
    gives_personality: boolean;
    track_id: string;
};
export type TextMessageContent = {
    type: 'text';
    text: string;
};

export type HideInputEffect = {
    hideInput: boolean;
};

export type MessageEffect = HideInputEffect;

export type ImageMessageContent = {
    type: 'images';
    text: string;
    images: string[];
};

export type ServiceMessageContent = {
    type: 'service_message';
    text: string;
};

export type VoiceRecordMessageContent = {
    type: 'voice_record';
    text: string;
};

export type VoiceRecognizedMessageContent = {
    type: 'voice_recognized';
    text: string;
};

export type AchievementMessageContent = {
    type: 'achievement';
    text: string;
    achievement_description: string;
    achievement_id: string;
    icon_url: string;
};