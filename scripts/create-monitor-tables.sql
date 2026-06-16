-- Script de criação das tabelas do monitorador
-- Banco: drfticket (schema public)

CREATE TABLE IF NOT EXISTS drf_monitor_rede (
    id                 SERIAL PRIMARY KEY,
    machine_uuid       UUID UNIQUE,
    machine_id         VARCHAR(255) NOT NULL,
    machine_ip         VARCHAR(50),
    nome_rede          VARCHAR(255),
    cnpj               VARCHAR(18),
    razao_social       VARCHAR(255),
    nome_fantasia      VARCHAR(255),
    situacao_cadastral VARCHAR(50),
    logradouro         TEXT,
    numero             VARCHAR(20),
    complemento        VARCHAR(100),
    bairro             VARCHAR(100),
    municipio          VARCHAR(100),
    uf                 VARCHAR(2),
    cep                VARCHAR(10),
    usuario_id         VARCHAR(100),
    configurado_em     TIMESTAMP DEFAULT NOW(),
    atualizado_em      TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS drf_monitor_processos (
    id               SERIAL PRIMARY KEY,
    machine_uuid     UUID,
    machine_id       VARCHAR(255) NOT NULL,
    process_local_id VARCHAR(50),
    process_name     VARCHAR(255),
    process_label    VARCHAR(255),
    watch_type       VARCHAR(20),
    auto_restart     BOOLEAN DEFAULT TRUE,
    log_enabled      BOOLEAN DEFAULT FALSE,
    log_path         TEXT,
    log_timeout_min  INTEGER DEFAULT 5,
    ativo            BOOLEAN DEFAULT TRUE,
    usuario_id       VARCHAR(100),
    configurado_em   TIMESTAMP DEFAULT NOW(),
    atualizado_em    TIMESTAMP DEFAULT NOW(),
    UNIQUE(machine_uuid, process_local_id)
);

CREATE TABLE IF NOT EXISTS drf_monitor_heartbeat (
    id              SERIAL PRIMARY KEY,
    machine_uuid    UUID UNIQUE,
    machine_id      VARCHAR(255) NOT NULL,
    machine_ip      VARCHAR(50),
    ultimo_contato  TIMESTAMP,
    cpu_percent     NUMERIC(5,2),
    mem_percent     NUMERIC(5,2),
    total_processos INTEGER DEFAULT 0,
    proc_rodando    INTEGER DEFAULT 0,
    proc_parado     INTEGER DEFAULT 0,
    status          VARCHAR(20) DEFAULT 'online'
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_monitor_rede_uuid ON drf_monitor_rede(machine_uuid);
CREATE INDEX IF NOT EXISTS idx_monitor_rede_nome ON drf_monitor_rede(nome_rede);
CREATE INDEX IF NOT EXISTS idx_monitor_processos_uuid ON drf_monitor_processos(machine_uuid);
CREATE INDEX IF NOT EXISTS idx_monitor_processos_ativo ON drf_monitor_processos(ativo);
CREATE INDEX IF NOT EXISTS idx_monitor_heartbeat_uuid ON drf_monitor_heartbeat(machine_uuid);
CREATE INDEX IF NOT EXISTS idx_monitor_heartbeat_status ON drf_monitor_heartbeat(status);

-- Dados de exemplo (opcional - comentar se não quiser)
-- INSERT INTO drf_monitor_rede (machine_uuid, machine_id, machine_ip, nome_rede, cnpj, razao_social, nome_fantasia, situacao_cadastral)
-- VALUES
--   ('550e8400-e29b-41d4-a716-446655440000', 'MACHINE-001', '192.168.1.10', 'Rede Principal', '12.345.678/0001-90', 'Empresa Exemplo LTDA', 'Empresa Exemplo', 'Ativa'),
--   ('550e8400-e29b-41d4-a716-446655440001', 'MACHINE-002', '192.168.1.11', 'Rede Principal', '12.345.678/0001-91', 'Outra Empresa LTDA', 'Outra Empresa', 'Ativa');
