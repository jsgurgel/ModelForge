CREATE TABLE [dbo].[Pais] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [Nome] NVARCHAR(100) NOT NULL,
    [Sigla] CHAR(2) NULL,
    CONSTRAINT [PK_Pais] PRIMARY KEY ([Id]),
    CONSTRAINT [UQ_Pais_Sigla] UNIQUE ([Sigla])
);

CREATE TABLE [dbo].[Cidade] (
    [Id] INT IDENTITY(1,1) NOT NULL,
    [PaisId] INT NOT NULL,
    [Nome] NVARCHAR(MAX) NOT NULL,
    [Populacao] BIGINT NULL DEFAULT (0),
    CONSTRAINT [PK_Cidade] PRIMARY KEY CLUSTERED ([Id]),
    CONSTRAINT [FK_Cidade_Pais] FOREIGN KEY ([PaisId]) REFERENCES [dbo].[Pais] ([Id])
);

ALTER TABLE [dbo].[Cidade] ADD CONSTRAINT [CK_Cidade_Pop] CHECK ([Populacao] >= 0);
CREATE NONCLUSTERED INDEX [IX_Cidade_Nome] ON [dbo].[Cidade] ([Nome] ASC);
