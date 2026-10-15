# Compose service — landed in compose.yml / docker-compose.yml (Phase 1).
# EIC transport remains local until Phase 3.
#
# Host ports: 127.0.0.1:50051 (gRPC), 127.0.0.1:8011 (health)
# In-net: ASSEMBLER_*_HOST=0.0.0.0 — peers use empery_assembler:50051 / :8011
#
# ECC_SERVICE_HEALTH_BASES includes:
#   empery_assembler=http://empery_assembler:8011
#
# Image: deploy/docker/Dockerfile.assembler
#
# EIC cutover (Phase 3):
#   EIC_ASSEMBLER_TRANSPORT=grpc
#   EIC_ASSEMBLER_GRPC_TARGET=empery_assembler:50051
