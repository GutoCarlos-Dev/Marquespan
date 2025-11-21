-- Create recebimentos table
CREATE TABLE IF NOT EXISTS recebimentos (
    id SERIAL PRIMARY KEY,
    id_cotacao UUID NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
    id_produto UUID NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    qtd_recebida DECIMAL(10,2) NOT NULL,
    data_recebimento TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Disable RLS (Row Level Security) as the project uses custom authentication
ALTER TABLE recebimentos DISABLE ROW LEVEL SECURITY;

-- Create trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recebimentos_updated_at
    BEFORE UPDATE ON recebimentos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
