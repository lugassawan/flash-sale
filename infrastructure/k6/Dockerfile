FROM grafana/k6:latest

WORKDIR /scripts

# When building from infrastructure/k6/ with pre-copied scripts:
#   docker build -t flash-sale-k6 .
#
# When running locally, prefer volume-mount (used by run-stress.sh):
#   docker run --rm --network host -v ./apps/backend/test/stress/k6:/scripts:ro grafana/k6 run /scripts/purchase-load.test.js
COPY . .

ENTRYPOINT ["k6"]
