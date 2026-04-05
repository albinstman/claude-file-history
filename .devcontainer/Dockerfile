# syntax=docker/dockerfile:1.7
FROM mcr.microsoft.com/devcontainers/base:ubuntu

ARG TARGETOS
ARG TARGETARCH

ARG GO_VERSION
ARG PROTOC_GEN_GO_VERSION
ARG PROTOC_GEN_GO_GRPC_VERSION

ARG PROTOC_VERSION
ARG NODE_MAJOR

# basics
RUN apt-get update && apt-get upgrade -y && apt-get install -y \
    curl \
    ca-certificates \
    wget \
    git \
    jq \
    unzip \
    vim \
    less \
    tree \
    ripgrep \
    fd-find \
    htop \
    zsh \
    fzf \
    net-tools \
    dnsutils \
    iputils-ping \
    traceroute \
    whois \
    tar \
    tcpdump \
    nmap \
    openssh-client \
    python3 \
    python3-pip \
    make \
    g++ \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Persist bash history across container rebuilds
RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir -p /commandhistory \
    && touch /commandhistory/.bash_history \
    && echo "$SNIPPET" >> /root/.bashrc

# Install Node.js (LTS) via NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update \
    && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

# Install Go
RUN set -eux; \
  GO_OS="${TARGETOS:-linux}"; \
  GO_ARCH="${TARGETARCH:-amd64}"; \
  curl -fsSL -o /tmp/go.tgz "https://go.dev/dl/go${GO_VERSION}.${GO_OS}-${GO_ARCH}.tar.gz"; \
  rm -rf /usr/local/go; \
  tar -C /usr/local -xzf /tmp/go.tgz; \
  rm /tmp/go.tgz
ENV GOROOT=/usr/local/go
ENV GOPATH=/go
ENV PATH="${GOROOT}/bin:${GOPATH}/bin:${PATH}"

# Install Go protoc
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@${PROTOC_GEN_GO_VERSION} && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@${PROTOC_GEN_GO_GRPC_VERSION}

# Install protoc
RUN set -eux; \
  OS="${TARGETOS:-linux}"; \
  ARCH="${TARGETARCH:-amd64}"; \
  case "$ARCH" in \
  amd64) PROTOC_PLATFORM="${OS}-x86_64" ;; \
  arm64) PROTOC_PLATFORM="${OS}-aarch_64" ;; \
  *) echo "Unsupported TARGETARCH: $ARCH" && exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/protoc.zip "https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-${PROTOC_PLATFORM}.zip"; \
  unzip -o /tmp/protoc.zip -d /usr/local bin/protoc 'include/*'; \
  rm /tmp/protoc.zip; \
  protoc --version

# Install kubectl
RUN set -eux; \
  ARCH="${TARGETARCH:-amd64}"; \
  curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/$(curl -sL https://dl.k8s.io/release/stable.txt)/bin/linux/${ARCH}/kubectl"; \
  chmod +x /usr/local/bin/kubectl; \
  kubectl version --client

# Install Terraform
RUN set -eux; \
  wget -O- https://apt.releases.hashicorp.com/gpg | gpg --dearmor -o /usr/share/keyrings/hashicorp-archive-keyring.gpg; \
  echo "deb [signed-by=/usr/share/keyrings/hashicorp-archive-keyring.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" | tee /etc/apt/sources.list.d/hashicorp.list; \
  apt-get update && apt-get install -y terraform && rm -rf /var/lib/apt/lists/*; \
  terraform version

# Install AWS CLI v2
RUN set -eux; \
  ARCH="${TARGETARCH:-amd64}"; \
  case "$ARCH" in \
  amd64) AWS_ARCH="x86_64" ;; \
  arm64) AWS_ARCH="aarch64" ;; \
  *) echo "Unsupported TARGETARCH: $ARCH" && exit 1 ;; \
  esac; \
  curl -fsSL -o /tmp/awscliv2.zip "https://awscli.amazonaws.com/awscli-exe-linux-${AWS_ARCH}.zip"; \
  unzip -q -o /tmp/awscliv2.zip -d /tmp; \
  /tmp/aws/install; \
  rm -rf /tmp/awscliv2.zip /tmp/aws; \
  aws --version