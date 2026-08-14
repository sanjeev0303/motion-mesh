export async function verifyApiKeySignature(plainKey: string){
    if(!plainKey) return false;
    if(plainKey.startsWith("mot_live_") || plainKey.startsWith("mot_test_")) return true;
    return false;
}
