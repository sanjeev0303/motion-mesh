export AURORA_HOST="somehost"
export AURORA_PORT="5432"
echo '{"spec":{"containers":[{"name":"pg-auth-test","image":"postgres:15-alpine","envFrom":[{"secretRef":{"name":"motionmesh-secrets"}}],"command":["sh","-c","pg_isready -h '"${AURORA_HOST}"' -p '"${AURORA_PORT}"' -U $DB_USER -d $DB_NAME"]}]}}'
