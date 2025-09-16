-- MySQL dump 10.13  Distrib 8.0.33, for Win64 (x86_64)
CREATE DATABASE controle_gastos /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `controle_gastos`;
-- Host: 127.0.0.1    Database: controle_gastos
-- ------------------------------------------------------
-- Server version	5.5.5-10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `expenses`
--

DROP TABLE IF EXISTS `expenses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `expenses` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `user_id` int(11) NOT NULL,
  `transaction_date` date NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `description` varchar(255) NOT NULL,
  `account` enum('Nu Bank Ketlyn','Nu Vainer','Ourocard Ketlyn','PicPay Vainer','PIX/Boleto') NOT NULL,
  `is_business_expense` tinyint(1) DEFAULT 0,
  `account_plan_code` int(11) DEFAULT NULL,
  `has_invoice` tinyint(1) DEFAULT NULL,
  `is_recurring_expense` tinyint(1) DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `invoice_path` varchar(255) DEFAULT NULL,
  `total_purchase_amount` decimal(10,2) DEFAULT NULL,
  `installment_number` int(11) DEFAULT NULL,
  `total_installments` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `user_id` (`user_id`),
  KEY `idx_account_plan_code` (`account_plan_code`),
  KEY `idx_account_date` (`account`, `transaction_date`),
  CONSTRAINT `expenses_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(255) NOT NULL,
  `password` varchar(255) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping routines for database 'controle_gastos'
--
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- =============================================================
-- Novo: Tabela de planos de contas até código 47
-- =============================================================
DROP TABLE IF EXISTS `account_plans`;
CREATE TABLE `account_plans` (
  `code` INT NOT NULL,
  `name` VARCHAR(150) NOT NULL,
  `monthly_ceiling` DECIMAL(10,2) DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT INTO `account_plans` (`code`,`name`,`monthly_ceiling`) VALUES
(1,'Adiantamento Sócios',1000.00),
(2,'Alimentação',2782.47),
(3,'Aluguel / Arrendamento',2431.67),
(4,'Aplicativos e Softwares',350.00),
(5,'Assessoria / Contabilidade',2100.00),
(6,'Assistência / Manutenção',550.00),
(7,'Água',270.00),
(8,'Combustíveis / Transporte',1200.00),
(9,'Comunicação / Telefonia',1200.00),
(10,'Condomínio',270.00),
(11,'COFINS',1895.40),
(12,'CSLL',2627.60),
(13,'Energia Elétrica',270.00),
(14,'Encargos Bancários',55.00),
(15,'Ferramentas / Assinaturas',129.90),
(16,'Hospedagem / Domínios',59.90),
(17,'Folha de Pagamento / Pró-Labore',4100.00),
(18,'Impostos Federais',1570.00),
(19,'INSS Patronal',500.00),
(20,'Internet',500.00),
(21,'IPTU / Licenças',150.00),
(22,'IRPJ',1134.00),
(23,'Juros / Multas',500.00),
(24,'Limpeza / Higiene',1000.00),
(25,'Logística / Entregas',350.00),
(26,'Manutenção Equipamentos',1000.00),
(27,'Marketing / ADS',500.00),
(28,'Materiais de Escritório',450.00),
(29,'Materiais de Limpeza',285.00),
(30,'Materiais Operacionais',700.00),
(31,'Motoboy / Fretes',200.00),
(32,'Outros Serviços',450.00),
(33,'Papelaria / Impressão',100.00),
(34,'Pedágios / Estacionamentos',54.80),
(35,'PIS',0.00),
(36,'Rescisões / Indenizações',0.00),
(37,'Seguros',0.00),
(38,'Serviços Profissionais',0.00),
(39,'Tarifas Bancárias',400.00),
(40,'Taxas Municipais',0.00),
(41,'Taxas Estaduais',0.00),
(42,'Taxas Federais',0.00),
(43,'Telefonia Móvel',210.00),
(44,'Treinamentos / Cursos',0.00),
(45,'Vendas / Custos Mercadorias',12700.00),
(46,'Investimentos / Expansão',0.00),
(47,'Reserva Emergencial / Fundo',0.00);

-- View simples para facilitar joins se necessário
CREATE OR REPLACE VIEW v_expenses_with_plan AS
SELECT e.*, ap.name AS plan_name, ap.monthly_ceiling
FROM expenses e
LEFT JOIN account_plans ap ON ap.code = e.account_plan_code;

-- Script atualizado em 2025-09-16
