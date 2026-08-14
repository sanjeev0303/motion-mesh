export type MotionmeshPlayerProps = {
    videoTrackingId: string;
    autoPlay?: boolean;
    playsInline?: boolean;
    onReady?: () => void;
    onError?: () => void;
}
